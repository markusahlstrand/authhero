import { z } from "@hono/zod-openapi";
import { jwksSchema } from "@authhero/adapter-interfaces";
import { PROXY_RESOLVE_HOST_SCOPE } from "@authhero/proxy";
import { decode, verify } from "hono/jwt";
import { importParamsForJwk, SupportedAlg } from "../../utils/jwk-alg";

const SUPPORTED_ALGS: ReadonlySet<SupportedAlg> = new Set<SupportedAlg>([
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
]);

function toSupportedAlg(alg: unknown): SupportedAlg | null {
  return typeof alg === "string" && SUPPORTED_ALGS.has(alg as SupportedAlg)
    ? (alg as SupportedAlg)
    : null;
}

function normalizeIssuer(url: URL): string {
  return url.href.replace(/\/$/, "");
}

/**
 * Strict issuer equality: parse both `iss` and `expected` as URLs and compare
 * the resulting hrefs after stripping any single trailing slash. No host-only
 * match, no subdomain match — a token issued by `https://a.example.com/` and
 * an expected `https://b.example.com/` (or `https://example.com/x/`) must NOT
 * be treated as equivalent.
 */
export function isAllowedIssuer(iss: string, expected: string): boolean {
  try {
    return normalizeIssuer(new URL(iss)) === normalizeIssuer(new URL(expected));
  } catch {
    return false;
  }
}

const jwksDocumentSchema = z.object({ keys: z.array(jwksSchema) });

export type VerifyControlPlaneTokenResult =
  | {
      ok: true;
      /**
       * The verified `tenant_id` claim, when the token carries one. Service
       * tokens minted by `createServiceTokenCore` always do; a client-credentials
       * token minted for a proxy may not. Callers that act on a tenant's data
       * MUST bind to this rather than to a tenant id taken from the request.
       */
      tenantId?: string;
    }
  | { ok: false; reason: string };

export interface VerifyControlPlaneTokenOptions {
  /** Compact JWS to verify. */
  token: string;
  /** Optional fetch override — defaults to global `fetch`. */
  jwksFetch?: (url: string) => Promise<Response>;
  /**
   * Set of acceptable `iss` claim values. Comparison is strict URL equality
   * (after trailing-slash normalization) via {@link isAllowedIssuer}. The
   * verifier fetches the per-issuer JWKS from `<iss>/.well-known/jwks.json`,
   * so any host you list here must publish its own JWKS at that path.
   */
  expectedIssuers: string[];
  /**
   * Required `scope` (the token's `scope` claim is space-separated). Pass an
   * array to accept any one of several scopes. Defaults to
   * `proxy:resolve_host`.
   */
  requiredScope?: string | string[];
  /**
   * Optional predicate consulted IN ADDITION to `expectedIssuers`, for issuers
   * that can't be enumerated ahead of time — specifically a deployment's own
   * Workers-for-Platforms tenant subdomains (`https://{tenant}.{host}/`), whose
   * per-tenant control-plane credential the accompanying `jwksFetch` resolves
   * locally (see #1139).
   *
   * Like `expectedIssuers`, it runs BEFORE the JWKS fetch, so it still gates
   * where the verifier will fetch keys from: return `true` only for issuer
   * hosts you actually serve. The signature must still verify against the
   * resolved key, so this does not broaden trust beyond "a caller holding that
   * tenant's registered private key."
   *
   * `tenantId` is the token's (as-yet UNVERIFIED) `tenant_id` claim. With
   * per-tenant signing keys the key owner is encoded in `iss` while the
   * `tenant_id` claim is set freely by the caller, so a predicate that only
   * looks at `iss` cannot stop tenant A (holding A's key) from acting on
   * tenant B by claiming `tenant_id: "B"`. Bind the two here — e.g.
   * `(iss, tid) => !!tid && iss === \`https://${tid}.${host}/\``. This is
   * sound despite `tenant_id` being unverified at predicate time: it is the
   * SAME token whose signature is checked moments later, so verification
   * confirms the exact `tenant_id` the predicate bound to `iss`. A forged
   * `tenant_id` either fails the predicate (mismatch with `iss`) or fails
   * signature verification (the caller lacks that subdomain's key).
   */
  isTrustedIssuer?: (iss: string, tenantId: string | undefined) => boolean;
}

function deriveJwksUrl(iss: string): string {
  return new URL("/.well-known/jwks.json", iss).href;
}

/**
 * Verify a bearer token for the proxy control plane. Returns `{ ok: true }`
 * on success, `{ ok: false, reason }` on any failure — the reason is for
 * logs only and must not be surfaced to the caller.
 *
 * Accepted algs: RS256/384/512, ES256/384/512. The JWK's `alg` must match
 * the token header's `alg`. The token must carry one of the configured
 * required scopes (`proxy:resolve_host` by default) and an `iss` that strictly equals
 * one of `expectedIssuers` after URL normalization. The JWKS document is
 * fetched from `<iss>/.well-known/jwks.json` AFTER the `iss` is allow-listed,
 * so an attacker cannot redirect the verifier to a JWKS they control.
 */
export async function verifyControlPlaneToken(
  options: VerifyControlPlaneTokenOptions,
): Promise<VerifyControlPlaneTokenResult> {
  const { token, jwksFetch, expectedIssuers } = options;
  const requiredScopes =
    options.requiredScope === undefined
      ? [PROXY_RESOLVE_HOST_SCOPE]
      : Array.isArray(options.requiredScope)
        ? options.requiredScope
        : [options.requiredScope];

  let header: { alg?: unknown; kid?: unknown };
  let unverifiedPayload: { iss?: unknown; tenant_id?: unknown };
  try {
    const decoded = decode(token);
    header = decoded.header as { alg?: unknown; kid?: unknown };
    unverifiedPayload = decoded.payload as {
      iss?: unknown;
      tenant_id?: unknown;
    };
  } catch {
    return { ok: false, reason: "malformed token" };
  }

  const alg = toSupportedAlg(header.alg);
  if (!alg) return { ok: false, reason: "unsupported alg" };
  if (typeof header.kid !== "string" || header.kid.length === 0) {
    return { ok: false, reason: "missing kid" };
  }

  // Allow-list the issuer BEFORE fetching anything: this is what prevents a
  // forged token from steering the JWKS fetch to an attacker-controlled host.
  // The optional `isTrustedIssuer` predicate widens the allow-list to a
  // deployment's own WFP tenant subdomains, but is still consulted here — ahead
  // of the fetch — so the SSRF guarantee holds.
  //
  // The predicate also receives the (unverified) `tenant_id` claim so it can
  // bind the key owner in `iss` to the tenant the caller claims to act on:
  // without this, a caller holding tenant A's subdomain key could set
  // `tenant_id: "B"` and act on B (cross-tenant escalation, #1143). Passing
  // the unverified claim is safe — the signature check below confirms the
  // exact `tenant_id` the predicate bound to `iss`.
  const issRaw = unverifiedPayload.iss;
  const claimedTenantId =
    typeof unverifiedPayload.tenant_id === "string"
      ? unverifiedPayload.tenant_id
      : undefined;
  if (
    typeof issRaw !== "string" ||
    !(
      expectedIssuers.some((expected) => isAllowedIssuer(issRaw, expected)) ||
      options.isTrustedIssuer?.(issRaw, claimedTenantId) === true
    )
  ) {
    return { ok: false, reason: "issuer mismatch" };
  }
  const iss = issRaw;

  // `expectedIssuers` matches parse `iss` as a URL, but a custom
  // `isTrustedIssuer` might accept a string that isn't a valid absolute URL —
  // in which case `deriveJwksUrl` (`new URL(...)`) throws. Reject gracefully
  // rather than letting a TypeError escape.
  let jwksUrl: string;
  try {
    jwksUrl = deriveJwksUrl(iss);
  } catch {
    return { ok: false, reason: "malformed issuer url" };
  }
  const fetchFn = jwksFetch ?? fetch;
  let jwksRes: Response;
  try {
    jwksRes = await fetchFn(jwksUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return { ok: false, reason: `jwks fetch failed: ${message}` };
  }
  if (!jwksRes.ok) {
    return { ok: false, reason: `jwks fetch http ${jwksRes.status}` };
  }
  let jwksBody: unknown;
  try {
    jwksBody = await jwksRes.json();
  } catch {
    return { ok: false, reason: "jwks body not json" };
  }
  const jwksParsed = jwksDocumentSchema.safeParse(jwksBody);
  if (!jwksParsed.success) {
    return { ok: false, reason: "jwks body schema mismatch" };
  }

  const jwk = jwksParsed.data.keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: "unknown kid" };
  if (jwk.alg !== alg) {
    return { ok: false, reason: "alg mismatch between jwk and token header" };
  }

  let cryptoKey: CryptoKey;
  try {
    const importParams = importParamsForJwk(jwk, alg);
    cryptoKey = await crypto.subtle.importKey("jwk", jwk, importParams, false, [
      "verify",
    ]);
  } catch {
    return { ok: false, reason: "key import failed" };
  }

  let verifiedPayload: { scope?: unknown; tenant_id?: unknown };
  try {
    verifiedPayload = (await verify(token, cryptoKey, alg)) as {
      scope?: unknown;
      tenant_id?: unknown;
    };
  } catch {
    return { ok: false, reason: "signature verification failed" };
  }

  const scopeClaim = verifiedPayload.scope;
  const scopes =
    typeof scopeClaim === "string"
      ? scopeClaim.split(/\s+/).filter(Boolean)
      : [];
  if (!requiredScopes.some((required) => scopes.includes(required))) {
    return { ok: false, reason: "missing required scope" };
  }

  return {
    ok: true,
    tenantId:
      typeof verifiedPayload.tenant_id === "string"
        ? verifiedPayload.tenant_id
        : undefined,
  };
}

export { PROXY_RESOLVE_HOST_SCOPE };
