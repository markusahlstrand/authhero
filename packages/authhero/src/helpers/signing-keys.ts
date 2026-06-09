import { SigningKey, KeysAdapter } from "@authhero/adapter-interfaces";
import { SigningKeyMode, SigningKeyModeOption } from "../types/AuthHeroConfig";

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

export async function resolveSigningKeys(
  keys: KeysAdapter,
  tenantId: string,
  modeOption: SigningKeyModeOption | undefined,
  opts: ResolveSigningKeysOptions,
): Promise<SigningKey[]> {
  const type = opts.type ?? "jwt_signing";
  const mode = await resolveSigningKeyMode(modeOption, tenantId);

  if (mode === "control-plane") {
    const controlPlaneKeys = await listControlPlaneKeys(keys, type);
    if (opts.purpose === "sign") {
      // Collapse to a single key so the sign path returns the same shape
      // (at most one element) regardless of mode.
      const preferred = controlPlaneKeys[0];
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
    // being provisioned. Returning a single-element array keeps callers
    // uniform with the publish path.
    const preferred = tenantKeys[0] ?? controlPlaneKeys[0];
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
