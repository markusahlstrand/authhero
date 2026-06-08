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
  | { ok: true }
  | { ok: false; reason: string };

export interface VerifyControlPlaneTokenOptions {
  /** Compact JWS to verify. */
  token: string;
  /** JWKS document URL. */
  jwksUrl: string;
  /** Optional fetch override — defaults to global `fetch`. */
  jwksFetch?: (url: string) => Promise<Response>;
  /** Expected `iss` claim (compared via {@link isAllowedIssuer}). */
  expectedIssuer: string;
  /** Required `scope` (space-separated). Defaults to `proxy:resolve_host`. */
  requiredScope?: string;
}

/**
 * Verify a bearer token for the proxy control plane. Returns `{ ok: true }`
 * on success, `{ ok: false, reason }` on any failure — the reason is for
 * logs only and must not be surfaced to the caller.
 *
 * Accepted algs: RS256/384/512, ES256/384/512. The JWK's `alg` must match
 * the token header's `alg`. The token must carry the configured required
 * scope (`proxy:resolve_host` by default) and an `iss` that strictly equals
 * `expectedIssuer` after URL normalization.
 */
export async function verifyControlPlaneToken(
  options: VerifyControlPlaneTokenOptions,
): Promise<VerifyControlPlaneTokenResult> {
  const { token, jwksUrl, jwksFetch, expectedIssuer } = options;
  const requiredScope = options.requiredScope ?? PROXY_RESOLVE_HOST_SCOPE;

  let header: { alg?: unknown; kid?: unknown };
  try {
    header = decode(token).header as { alg?: unknown; kid?: unknown };
  } catch {
    return { ok: false, reason: "malformed token" };
  }

  const alg = toSupportedAlg(header.alg);
  if (!alg) return { ok: false, reason: "unsupported alg" };
  if (typeof header.kid !== "string" || header.kid.length === 0) {
    return { ok: false, reason: "missing kid" };
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
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      importParams,
      false,
      ["verify"],
    );
  } catch {
    return { ok: false, reason: "key import failed" };
  }

  let verifiedPayload: { iss?: unknown; scope?: unknown };
  try {
    verifiedPayload = (await verify(token, cryptoKey, alg)) as {
      iss?: unknown;
      scope?: unknown;
    };
  } catch {
    return { ok: false, reason: "signature verification failed" };
  }

  if (
    typeof verifiedPayload.iss !== "string" ||
    !isAllowedIssuer(verifiedPayload.iss, expectedIssuer)
  ) {
    return { ok: false, reason: "issuer mismatch" };
  }

  const scopeClaim = verifiedPayload.scope;
  const scopes =
    typeof scopeClaim === "string"
      ? scopeClaim.split(/\s+/).filter(Boolean)
      : [];
  if (!scopes.includes(requiredScope)) {
    return { ok: false, reason: "missing required scope" };
  }

  return { ok: true };
}

export { PROXY_RESOLVE_HOST_SCOPE };
