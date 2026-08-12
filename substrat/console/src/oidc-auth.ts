// AuthHero OIDC bearer verify → kernel principal (harness; exempt from module
// rules). Worker-safe: Web Crypto + fetch only, no node:*. Reused by the worker
// and (later) the node dev server.
//
// AuthHero signs access tokens RS256 and publishes JWKS at
// `${issuer}.well-known/jwks.json` (issuer ends with '/'; byte-exact in the `iss`
// claim — see the repo rule about never normalizing it). Verification: signature
// against the issuer's JWKS (kid-selected, cache + refresh-on-unknown-kid), `iss`
// match, `exp`, and — when configured — `aud` containing OIDC_AUDIENCE.
import { principalForSub } from "./identity.js";

export interface OidcVerifyConfig {
  /** Static JWKS (bridge for platforms where worker-to-worker fetch fails). */
  staticJwks?: { keys: unknown[] };
  /** The AuthHero issuer, byte-exact as it appears in `iss` (e.g. https://auth.example.com/). */
  issuer: string;
  /** Optional audience the token must carry (an AuthHero API identifier). */
  audience?: string;
}

export interface OidcClaims {
  sub?: string;
  iss?: string;
  exp?: number;
  aud?: string | string[];
  azp?: string;
  email?: string;
}

// The RSA JWK fields we carry — structurally assignable to both lib.dom's and
// workers-types' JsonWebKey (kty required there), no cast needed.
interface Jwk {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

const b64urlToBytes = (s: string): Uint8Array<ArrayBuffer> => {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64urlToString = (s: string): string =>
  new TextDecoder().decode(b64urlToBytes(s));

// Small in-isolate JWKS cache; unknown kid forces a refresh so a just-rotated
// key verifies before the TTL elapses.
const JWKS_TTL_MS = 10 * 60_000;
const jwksCache = new Map<string, { keys: Jwk[]; at: number }>();

async function jwksFor(issuer: string, forceKid?: string): Promise<Jwk[]> {
  const cached = jwksCache.get(issuer);
  const fresh = cached && Date.now() - cached.at < JWKS_TTL_MS;
  const hasKid = !forceKid || cached?.keys.some((k) => k.kid === forceKid);
  if (cached && fresh && hasKid) return cached.keys;
  const base = issuer.endsWith("/") ? issuer : `${issuer}/`;
  const res = await fetch(`${base}.well-known/jwks.json`);
  const body = (await res.json().catch(() => ({}))) as { keys?: Jwk[] };
  const keys = (body.keys ?? []).filter((k) => typeof k.kty === "string");
  jwksCache.set(issuer, { keys, at: Date.now() });
  return keys;
}

/** Verify signature + claims; returns the claims or null — fail closed, never throw. */
export async function verifyAuthHeroToken(
  token: string,
  cfg: OidcVerifyConfig,
): Promise<OidcClaims | null> {
  try {
    const [h, p, sig] = token.split(".");
    if (!h || !p || !sig) return null;
    const header = JSON.parse(b64urlToString(h)) as {
      alg?: string;
      kid?: string;
    };
    if (header.alg !== "RS256") return null;

    const claims = JSON.parse(b64urlToString(p)) as OidcClaims;
    // Route by the token's own iss, then trust nothing until the signature
    // verifies against THAT issuer's keys. Compare loosely on the trailing
    // slash only (the issuer itself is stored byte-exact).
    const iss = claims.iss ?? "";
    if (iss.replace(/\/$/, "") !== cfg.issuer.replace(/\/$/, "")) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now())
      return null;
    if (cfg.audience) {
      const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!aud.includes(cfg.audience)) return null;
    }

    const staticKeys = (cfg.staticJwks?.keys ?? []).filter(
    (k): k is Jwk => typeof k === "object" && k !== null && typeof (k as Jwk).kty === "string",
  );
  const keys = staticKeys.some((k) => !header.kid || k.kid === header.kid)
    ? staticKeys
    : await jwksFor(cfg.issuer, header.kid);
    const jwk =
      (header.kid ? keys.find((k) => k.kid === header.kid) : keys[0]) ?? null;
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const data = new TextEncoder().encode(`${h}.${p}`);
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(sig),
      data,
    );
    return ok && claims.sub ? claims : null;
  } catch {
    return null;
  }
}

/** Authorization: Bearer … → kernel principal, or null. */
export async function principalFromAuthHero(
  headers: { get(name: string): string | null },
  cfg: OidcVerifyConfig,
): Promise<{
  principal: ReturnType<typeof principalForSub>;
  claims: OidcClaims;
} | null> {
  const m = headers.get("authorization")?.match(/^Bearer (.+)$/i);
  if (!m || !m[1]) return null;
  const claims = await verifyAuthHeroToken(m[1], cfg);
  if (!claims?.sub) return null;
  return { principal: principalForSub(claims.sub), claims };
}
