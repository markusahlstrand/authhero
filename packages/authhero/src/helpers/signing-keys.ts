import { SigningKey, KeysAdapter } from "@authhero/adapter-interfaces";
import { SigningKeyMode, SigningKeyModeOption } from "../types/AuthHeroConfig";
import { createX509Certificate } from "../utils/encryption";

/**
 * Returns the non-revoked subset of a list result, sorted newest-first.
 * Mirrors the `revoked_at > now()` semantics that the kysely adapter applies
 * at read time, so the rest of the helper can treat the result as "usable".
 */
function nonRevoked(keys: SigningKey[]): SigningKey[] {
  const now = new Date();
  return keys
    .filter((k) => !k.revoked_at || new Date(k.revoked_at) > now)
    .sort((a, b) => {
      // Sort by current_since desc as a tiebreaker so the most recently
      // promoted key wins; falls back to kid for stability when not set.
      const aTime = a.current_since ? new Date(a.current_since).getTime() : 0;
      const bTime = b.current_since ? new Date(b.current_since).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;
      return b.kid.localeCompare(a.kid);
    });
}

// Values are interpolated into a Lucene-style query the kysely adapter
// tokenizes on whitespace; reject anything that could break out of the
// `field:value` shape so a crafted tenant_id can't inject extra clauses.
const SAFE_LUCENE_TERM = /^[A-Za-z0-9._-]+$/;

function assertSafeLuceneTerm(value: string, label: string): void {
  if (!SAFE_LUCENE_TERM.test(value)) {
    throw new Error(`Invalid ${label}: must match ${SAFE_LUCENE_TERM}`);
  }
}

// Bumped well above the adapter default per_page (kysely: 100, drizzle: 50)
// so a long key history doesn't silently truncate a JWKS that must contain
// every still-active key for verification.
const LIST_PAGE_SIZE = 1000;

async function listByTenant(
  keys: KeysAdapter,
  tenantId: string,
  type: string,
): Promise<SigningKey[]> {
  assertSafeLuceneTerm(tenantId, "tenant_id");
  assertSafeLuceneTerm(type, "type");
  const { signingKeys } = await keys.list({
    q: `type:${type} AND tenant_id:${tenantId}`,
    sort: { sort_by: "created_at", sort_order: "desc" },
    per_page: LIST_PAGE_SIZE,
  });
  return nonRevoked(signingKeys);
}

export async function listControlPlaneKeys(
  keys: KeysAdapter,
  type = "jwt_signing",
): Promise<SigningKey[]> {
  assertSafeLuceneTerm(type, "type");
  const { signingKeys } = await keys.list({
    q: `type:${type} AND -_exists_:tenant_id`,
    sort: { sort_by: "created_at", sort_order: "desc" },
    per_page: LIST_PAGE_SIZE,
  });
  return nonRevoked(signingKeys);
}

export async function resolveSigningKeyMode(
  option: SigningKeyModeOption | undefined,
  tenantId: string,
): Promise<SigningKeyMode> {
  if (!option) return "control-plane";
  if (typeof option === "string") return option;
  return option({ tenant_id: tenantId });
}

export interface ResolveSigningKeysOptions {
  /**
   * `"sign"` returns at most one key — the tenant's newest non-revoked key
   * if available, else the control-plane fallback. `"publish"` returns the
   * full set used for JWKS: control-plane only when mode is
   * `"control-plane"`, tenant ∪ control-plane when mode is `"tenant"` so
   * tokens signed by either bucket still verify during rotation.
   */
  purpose: "sign" | "publish";
  /** Defaults to `"jwt_signing"`. Pass `"saml_encryption"` for SAML keys. */
  type?: string;
}

/**
 * SAML certificates are per-tenant by nature: each one is published in that
 * tenant's IdP metadata and pinned by that tenant's service providers, so
 * rotating a shared one would force every unrelated tenant's service providers
 * to re-trust a certificate at the same moment.
 *
 * They therefore always resolve with tenant semantics — the tenant's own key
 * first, the shared control-plane key as a fallback — regardless of the
 * deployment's `signingKeyMode`, which exists for JWT signing keys where a
 * shared key is the sane default. A deployment whose SAML key is unscoped is
 * unaffected: with no tenant-scoped key to prefer, the fallback is the only
 * candidate and resolution is identical.
 */
function modeForType(mode: SigningKeyMode, type: string): SigningKeyMode {
  return type === "saml_encryption" ? "tenant" : mode;
}

export async function resolveSigningKeys(
  keys: KeysAdapter,
  tenantId: string,
  modeOption: SigningKeyModeOption | undefined,
  opts: ResolveSigningKeysOptions,
): Promise<SigningKey[]> {
  const type = opts.type ?? "jwt_signing";
  const mode = modeForType(
    await resolveSigningKeyMode(modeOption, tenantId),
    type,
  );

  if (mode === "control-plane") {
    const controlPlaneKeys = await listControlPlaneKeys(keys, type);
    if (opts.purpose === "sign") {
      // Collapse to a single key so the sign path returns the same shape
      // (at most one element) regardless of mode. Pick the newest *signable*
      // key: a WFP tenant's control-plane scope also holds verify-only public
      // keys projected from the control plane (private material stripped), and
      // a control-plane rotation can re-sync a newer public key that would
      // otherwise out-sort the tenant's own private key — leaving the signer
      // with nothing to sign (#1181).
      const preferred = controlPlaneKeys.find(isActiveSigner);
      return preferred ? [preferred] : [];
    }
    return controlPlaneKeys;
  }

  // mode === "tenant"
  const [tenantKeys, controlPlaneKeys] = await Promise.all([
    listByTenant(keys, tenantId, type),
    listControlPlaneKeys(keys, type),
  ]);

  if (opts.purpose === "sign") {
    // Prefer a tenant key; fall back to control-plane while a tenant key is
    // being provisioned. Only signable keys are candidates — projected public
    // verify keys can't sign (#1181). Returning a single-element array keeps
    // callers uniform with the publish path.
    const preferred =
      tenantKeys.find(isActiveSigner) ?? controlPlaneKeys.find(isActiveSigner);
    return preferred ? [preferred] : [];
  }

  // purpose === "publish": union, dedup by kid (tenant entries win).
  const seen = new Set<string>();
  const merged: SigningKey[] = [];
  for (const k of [...tenantKeys, ...controlPlaneKeys]) {
    if (seen.has(k.kid)) continue;
    seen.add(k.kid);
    merged.push(k);
  }
  return merged;
}

/** A key is signable only if it carries private material, not just a cert. */
export function isSignable(key: SigningKey): boolean {
  return Boolean(key.pkcs7 && key.cert);
}

/**
 * A key with `current_since` in the future is *staged*: published so relying
 * parties can pre-trust it, but not yet signing anything.
 *
 * This is what makes a zero-downtime rotation possible for a SAML service
 * provider that pins the certificate out-of-band. The new certificate appears
 * in the IdP metadata immediately, the operator gets it to the service
 * provider, and only then does it start signing — the reverse order breaks
 * every login in between.
 */
export function isStaged(key: SigningKey, now = new Date()): boolean {
  return Boolean(key.current_since && new Date(key.current_since) > now);
}

/** Signing candidates: private material present and activation already due. */
function isActiveSigner(key: SigningKey): boolean {
  return isSignable(key) && !isStaged(key);
}

export interface EnsureSigningKeyOptions {
  /**
   * When set, the key is created tenant-scoped (`tenant_id` stamped) and the
   * existence check is scoped to that tenant. Omit for a control-plane key
   * (no `tenant_id`), which `resolveSigningKeys` resolves in both modes — as
   * the primary key in `"control-plane"` mode and as the fallback in
   * `"tenant"` mode. Control-plane scope is the right default for a freshly
   * provisioned WFP tenant.
   */
  tenantId?: string;
  /** Cert CN. Falls back to the tenant id, then to `"authhero"`. */
  name?: string;
  /** Defaults to `"jwt_signing"`. */
  type?: SigningKey["type"];
}

export interface EnsureSigningKeyResult {
  /** True when a new key was minted; false when a signable key already existed. */
  created: boolean;
  key: SigningKey;
}

/**
 * Guarantees the target scope holds at least one *signable* key — one carrying
 * private material (`pkcs7` + `cert`), not merely a projected public verify key.
 *
 * A freshly provisioned WFP tenant inherits only the control plane's public
 * keys (private material stripped at the boundary), so it can serve JWKS and
 * `/authorize` but 500s at `/oauth/token` with nothing to sign — issue #1181.
 * Calling this at provision time closes that gap by minting the tenant's own
 * RS256 key locally (private material never crosses the control-plane boundary).
 *
 * Create-if-missing and idempotent: a scope that already has a signable key is
 * left untouched, so it is safe to call on every provision and re-sync.
 */
export async function ensureSigningKey(
  keys: KeysAdapter,
  opts: EnsureSigningKeyOptions = {},
): Promise<EnsureSigningKeyResult> {
  const type: SigningKey["type"] = opts.type ?? "jwt_signing";
  const existing = opts.tenantId
    ? await listByTenant(keys, opts.tenantId, type)
    : await listControlPlaneKeys(keys, type);

  // A staged key doesn't satisfy the invariant this function exists to keep:
  // the scope still has nothing that can sign right now.
  const signable = existing.find(isActiveSigner);
  if (signable) {
    return { created: false, key: signable };
  }

  // Default keyType is RSA -> RS256, matching seed.ts and the rotate endpoint.
  const generated = await createX509Certificate({
    name: `CN=${opts.name || opts.tenantId || "authhero"}`,
  });
  const key: SigningKey = {
    ...generated,
    type,
    // Stamp current_since so this key wins the resolveSigningKeys tiebreaker
    // over any key minted concurrently at ~the same instant.
    current_since: new Date().toISOString(),
    ...(opts.tenantId ? { tenant_id: opts.tenantId } : {}),
  };
  await keys.create(key);
  return { created: true, key };
}
