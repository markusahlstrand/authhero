import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { JSONHTTPException } from "../errors/json-http-exception";
import { decode, verify } from "hono/jwt";
import type { TokenHeader } from "hono/utils/jwt/jwt";
import type { JWTPayload } from "hono/utils/jwt/types";
import { encodeBase64Url } from "@authhero/adapter-interfaces";
import { getJwksForVerification } from "./jwks";
import { getIssuer } from "../variables";
import { importParamsForJwk, SupportedAlg } from "./jwk-alg";

export type JWTSigningAlg =
  | "HS256"
  | "HS384"
  | "HS512"
  | "RS256"
  | "RS384"
  | "RS512"
  | "ES256"
  | "ES384"
  | "ES512";

const EC_CURVE_BY_ALG: Record<string, string> = {
  ES256: "P-256",
  ES384: "P-384",
  ES512: "P-521",
};

export interface SignJWTOptions {
  /** Sets `exp` to now + this many seconds. */
  expiresInSeconds?: number;
  /** Sets `iat` to now. */
  includeIssuedTimestamp?: boolean;
  /** Extra JOSE header members (e.g. `kid`); merged over `alg`/`typ`. */
  headers?: Record<string, unknown>;
}

// Copy into a freshly allocated ArrayBuffer so the value satisfies the Web
// Crypto BufferSource typing (which requires an ArrayBuffer rather than a
// possibly-SharedArrayBuffer-backed view).
function toArrayBuffer(key: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (!(key instanceof Uint8Array)) {
    return key;
  }
  const buffer = new ArrayBuffer(key.byteLength);
  new Uint8Array(buffer).set(key);
  return buffer;
}

function hashForAlg(alg: JWTSigningAlg): string {
  return `SHA-${alg.slice(2)}`;
}

async function importSigningKey(
  alg: JWTSigningAlg,
  key: ArrayBuffer | Uint8Array,
): Promise<CryptoKey> {
  const raw = toArrayBuffer(key);
  if (alg.startsWith("HS")) {
    return crypto.subtle.importKey(
      "raw",
      raw,
      { name: "HMAC", hash: hashForAlg(alg) },
      false,
      ["sign"],
    );
  }
  if (alg.startsWith("RS")) {
    return crypto.subtle.importKey(
      "pkcs8",
      raw,
      { name: "RSASSA-PKCS1-v1_5", hash: hashForAlg(alg) },
      false,
      ["sign"],
    );
  }
  const namedCurve = EC_CURVE_BY_ALG[alg];
  if (!namedCurve) {
    throw new Error(`Unsupported JWT signing alg: ${alg}`);
  }
  return crypto.subtle.importKey(
    "pkcs8",
    raw,
    { name: "ECDSA", namedCurve },
    false,
    ["sign"],
  );
}

/**
 * Sign a JWT (compact JWS) on Web Crypto. `key` is the raw HMAC secret for
 * HS* or a PKCS#8 private key for RS* and ES*. ECDSA signatures use the raw
 * `r ‖ s` form Web Crypto produces, as JWS requires.
 */
export async function signJWT(
  algorithm: JWTSigningAlg,
  key: ArrayBuffer | Uint8Array,
  payloadClaims: Record<string, unknown>,
  options: SignJWTOptions = {},
): Promise<string> {
  const header: Record<string, unknown> = {
    alg: algorithm,
    typ: "JWT",
    ...options.headers,
  };
  const payload: Record<string, unknown> = { ...payloadClaims };
  if (options.expiresInSeconds !== undefined) {
    payload.exp = Math.floor(Date.now() / 1000) + options.expiresInSeconds;
  }
  if (options.includeIssuedTimestamp === true) {
    payload.iat = Math.floor(Date.now() / 1000);
  }

  const encoder = new TextEncoder();
  const headerPart = encodeBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadPart = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const data = encoder.encode(`${headerPart}.${payloadPart}`);

  const cryptoKey = await importSigningKey(algorithm, key);
  const signature = await crypto.subtle.sign(
    algorithm.startsWith("ES")
      ? { name: "ECDSA", hash: hashForAlg(algorithm) }
      : cryptoKey.algorithm.name,
    cryptoKey,
    data,
  );

  return `${headerPart}.${payloadPart}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export interface ParsedJWT {
  header: TokenHeader;
  payload: JWTPayload;
}

/**
 * Decode a compact JWT without verifying its signature; null on malformed
 * input. For reading claims out of tokens we minted ourselves or received
 * over a channel that authenticates the issuer (e.g. an IdP token
 * endpoint). Anything accepted from the outside goes through
 * `validateJwtToken` or the JWKS verifiers in helpers/ instead.
 */
export function parseJWT(jwt: string): ParsedJWT | null {
  try {
    const { header, payload } = decode(jwt);
    if (
      typeof header !== "object" ||
      header === null ||
      typeof payload !== "object" ||
      payload === null
    ) {
      return null;
    }
    return { header, payload };
  } catch {
    return null;
  }
}

export interface JwtPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  scope: string;
  permissions?: string[];
  azp?: string;
  tenant_id?: string;
  org_id?: string;
  org_name?: string;
  // RFC 8693 §4.1 — present on tokens minted via a delegated flow.
  act?: { sub: string; client_id?: string };
}

function toSupportedAlg(alg: unknown): SupportedAlg {
  switch (alg) {
    case "RS256":
    case "RS384":
    case "RS512":
    case "ES256":
    case "ES384":
    case "ES512":
      return alg;
    default:
      throw new JSONHTTPException(401, {
        message: `Unsupported JWS alg: ${alg ?? "(missing)"}`,
      });
  }
}

export interface ValidateJwtTokenOptions {
  /**
   * Skip the `iss === getIssuer(env, custom_domain)` check. Use only when the
   * caller will perform its own issuer check with caller-specific error
   * semantics — e.g. RFC 8693 token-exchange returns `invalid_grant` (400/403)
   * for iss mismatch rather than the 401 this function would raise.
   */
  skipIssuerCheck?: boolean;
  /**
   * Additional issuers accepted **in addition to**
   * `getIssuer(env, custom_domain)`. A token whose `iss` matches the expected
   * issuer OR any value in this list passes the issuer check. The host app
   * resolves this list (e.g. from a control-plane issuer) and threads it in;
   * authhero never derives or hardcodes any issuer itself. Defaults to the
   * strict single-issuer check when omitted.
   */
  additionalIssuers?: string[];
}

/**
 * Raised when the subject JWT carried a past `exp`. Extends JSONHTTPException
 * with the same 403/"Invalid JWT signature" body the wrapper used to emit for
 * any verify failure, so callers that only branch on `instanceof HTTPException`
 * keep their current behavior. Token-exchange catches this class specifically
 * to emit the RFC 8693 `invalid_grant` / "Subject token has expired" response.
 */
export class JwtExpiredError extends JSONHTTPException {
  constructor() {
    super(403, { message: "Invalid JWT signature" });
    this.name = "JwtExpiredError";
  }
}

export async function validateJwtToken(
  ctx: Context,
  token: string,
  options: ValidateJwtTokenOptions = {},
): Promise<JwtPayload> {
  try {
    const { header } = decode(token);
    const alg = toSupportedAlg(header?.alg);

    // Scope verification to the tenant resolved from the request. Loading the
    // global keyset would let a token signed for tenant A verify against
    // tenant B's API (matching kid), even though A's iss wouldn't match B's
    // host — checked below as a second line of defense.
    const jwksKeys = await getJwksForVerification(
      ctx.env.data,
      ctx.var.tenant_id,
      ctx.env.signingKeyMode,
    );
    const jwksKey = jwksKeys.find((key) => key.kid === header.kid);

    if (!jwksKey) {
      throw new JSONHTTPException(401, { message: "No matching kid found" });
    }

    // The JWK's published alg is authoritative. Reject tokens whose header
    // alg differs (or where the JWK didn't bind itself to an alg) so an
    // attacker can't reuse a kid to verify with an alg the key wasn't
    // intended for.
    if (jwksKey.alg !== alg) {
      throw new JSONHTTPException(401, {
        message: "alg mismatch between token header and JWK",
      });
    }

    const importParams = importParamsForJwk(jwksKey, alg);
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwksKey,
      importParams,
      false,
      ["verify"],
    );

    const verifiedPayload = (await verify(
      token,
      cryptoKey,
      alg,
    )) as unknown as JwtPayload;

    // Pin the token to the host it was issued for. A custom-domain tenant
    // mints tokens with iss=https://<custom-domain>/; the canonical control
    // plane uses env.ISSUER. Without this check, a kid that appears in both
    // keysets (e.g. control-plane fallback during tenant key rollout) would
    // let a token issued on host A authenticate on host B.
    if (!options.skipIssuerCheck) {
      const expectedIssuer = getIssuer(ctx.env, ctx.var.custom_domain);
      const additionalIssuers = options.additionalIssuers ?? [];
      if (
        verifiedPayload.iss !== expectedIssuer &&
        !additionalIssuers.includes(verifiedPayload.iss)
      ) {
        throw new JSONHTTPException(401, { message: "Invalid issuer" });
      }
    }

    return verifiedPayload;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    // hono/jwt raises a plain Error subclass named "JwtTokenExpired" when the
    // token's `exp` is in the past. Surface that as a discriminable subclass
    // so callers with expiry-specific semantics (RFC 8693 token-exchange) can
    // branch on it; default behavior — a generic 403 — is preserved via the
    // base class.
    if (error instanceof Error && error.name === "JwtTokenExpired") {
      throw new JwtExpiredError();
    }
    throw new JSONHTTPException(403, { message: "Invalid JWT signature" });
  }
}
