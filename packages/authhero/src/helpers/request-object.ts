import { Jwk, decodeBase64Url } from "@authhero/adapter-interfaces";
import { importParamsForJwk, SupportedAlg } from "../utils/jwk-alg";
import {
  loadClientJwks,
  LoadClientKeysOptions,
  ClientWithKeys,
} from "./client-keys";

/**
 * Narrow client shape used by the request-object verifier. Allows passing
 * `EnrichedClient` (which redefines `connections`) without a structural
 * mismatch against the wider `Client` type.
 */
export interface RequestObjectClient extends ClientWithKeys {
  client_id: string;
  client_secret?: string | undefined;
}

const SUPPORTED_ASYMMETRIC_ALGS = new Set<SupportedAlg>([
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
]);

const SUPPORTED_SYMMETRIC_ALGS = new Set(["HS256", "HS384", "HS512"]);

const HS_HASH_BY_ALG: Record<string, string> = {
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
};

const RSA_VERIFY_PARAMS: AlgorithmIdentifier = { name: "RSASSA-PKCS1-v1_5" };
const EC_HASH_BY_ALG: Record<string, string> = {
  ES256: "SHA-256",
  ES384: "SHA-384",
  ES512: "SHA-512",
};

export class RequestObjectVerificationError extends Error {
  constructor(
    public code:
      | "invalid_request_object"
      | "unsupported_alg"
      | "missing_keys"
      | "signature_invalid"
      | "claim_invalid",
    message: string,
  ) {
    super(message);
    this.name = "RequestObjectVerificationError";
  }
}

export interface VerifyRequestObjectOptions extends LoadClientKeysOptions {
  /**
   * Issuer URL of this authorization server. The `aud` claim of the request
   * object MUST match this (as a string or one element of an array). When
   * unset, the audience check is skipped — only enable for testing.
   */
  issuer: string;
  /** Optional clock-skew leeway in seconds for exp/nbf checks. Defaults to 30. */
  leewaySeconds?: number;
  /** Override Date.now() for tests (returns ms since epoch). */
  now?: () => number;
}

interface JoseHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

function decodeJoseSegment<T = unknown>(segment: string): T {
  const decoded = new TextDecoder().decode(
    decodeBase64Url(segment),
  );
  const parsed = JSON.parse(decoded);
  if (typeof parsed !== "object" || parsed === null) {
    throw new RequestObjectVerificationError(
      "invalid_request_object",
      "JOSE segment is not an object",
    );
  }
  return parsed as T;
}

/**
 * Verify an OIDC Request Object (signed JWT, RFC 9101 / OIDC Core 6.1) sent
 * via the `request=` parameter or fetched from `request_uri=`.
 *
 * Returns the parsed JWT claims when the signature is valid, the alg is
 * supported, and basic temporal/audience checks pass. Throws
 * RequestObjectVerificationError otherwise.
 *
 * `alg: none` (unsigned) request objects are rejected. The current `request=`
 * pre-check in /authorize used to accept these unconditionally, which let any
 * caller forge claims; closing that hole is the main motivator for this code
 * path.
 */
export async function verifyRequestObject(
  jwt: string,
  client: RequestObjectClient,
  opts: VerifyRequestObjectOptions,
): Promise<Record<string, unknown>> {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new RequestObjectVerificationError(
      "invalid_request_object",
      "request object is not a 3-part JWS",
    );
  }
  const [headerSeg, payloadSeg, signatureSeg] = parts as [
    string,
    string,
    string,
  ];

  let header: JoseHeader;
  let payload: Record<string, unknown>;
  try {
    header = decodeJoseSegment<JoseHeader>(headerSeg);
    payload = decodeJoseSegment<Record<string, unknown>>(payloadSeg);
  } catch (e) {
    if (e instanceof RequestObjectVerificationError) throw e;
    throw new RequestObjectVerificationError(
      "invalid_request_object",
      "failed to decode JOSE segments",
    );
  }

  if (!header.alg) {
    throw new RequestObjectVerificationError(
      "invalid_request_object",
      "missing alg",
    );
  }
  if (header.alg === "none") {
    throw new RequestObjectVerificationError(
      "unsupported_alg",
      "unsigned request objects (alg=none) are not accepted",
    );
  }

  // Copy via fresh Uint8Array<ArrayBuffer> so the underlying buffer is
  // an `ArrayBuffer` (not `ArrayBufferLike`), which `crypto.subtle.verify`'s
  // BufferSource parameter requires under TS 5.7+ DOM types.
  const signedInput = new Uint8Array(
    new TextEncoder().encode(`${headerSeg}.${payloadSeg}`),
  );
  const signature = new Uint8Array(
    decodeBase64Url(signatureSeg),
  );

  if (SUPPORTED_SYMMETRIC_ALGS.has(header.alg)) {
    if (!client.client_secret) {
      throw new RequestObjectVerificationError(
        "missing_keys",
        "client has no client_secret for HMAC verification",
      );
    }
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(new TextEncoder().encode(client.client_secret)),
      { name: "HMAC", hash: HS_HASH_BY_ALG[header.alg]! },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      signature,
      signedInput,
    );
    if (!ok) {
      throw new RequestObjectVerificationError(
        "signature_invalid",
        "HMAC signature did not verify",
      );
    }
  } else if (SUPPORTED_ASYMMETRIC_ALGS.has(header.alg as SupportedAlg)) {
    const alg = header.alg as SupportedAlg;
    const jwks = await loadClientJwks(client, { fetch: opts.fetch });
    if (jwks.length === 0) {
      throw new RequestObjectVerificationError(
        "missing_keys",
        "client has no jwks/jwks_uri registered",
      );
    }
    const candidates: Jwk[] = header.kid
      ? jwks.filter((k) => k.kid === header.kid)
      : jwks.filter((k) => matchesAlg(k, alg));
    if (candidates.length === 0) {
      throw new RequestObjectVerificationError(
        "missing_keys",
        header.kid
          ? `no JWK found with kid=${header.kid}`
          : `no JWK found for alg=${alg}`,
      );
    }
    // Try every alg-compatible candidate; any single key that verifies passes.
    // Failed import or verify on one key must not be fatal — another candidate
    // may still match.
    let verified = false;
    let attemptedVerify = false;
    for (const candidate of candidates) {
      if (!matchesAlg(candidate, alg)) continue;
      let cryptoKey: CryptoKey;
      try {
        const importParams = importParamsForJwk(candidate, alg);
        cryptoKey = await crypto.subtle.importKey(
          "jwk",
          candidate,
          importParams,
          false,
          ["verify"],
        );
      } catch {
        continue;
      }
      const verifyParams =
        candidate.kty === "EC"
          ? { name: "ECDSA", hash: EC_HASH_BY_ALG[alg]! }
          : RSA_VERIFY_PARAMS;
      try {
        attemptedVerify = true;
        if (
          await crypto.subtle.verify(
            verifyParams,
            cryptoKey,
            signature,
            signedInput,
          )
        ) {
          verified = true;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!verified) {
      // If no candidate was alg-compatible and importable, this is a key
      // problem (`missing_keys`) rather than a signature mismatch.
      throw new RequestObjectVerificationError(
        attemptedVerify ? "signature_invalid" : "missing_keys",
        attemptedVerify
          ? `asymmetric signature did not verify (kid=${header.kid ?? "(none)"}, alg=${alg})`
          : `no JWK compatible with alg=${alg} (kid=${header.kid ?? "(none)"})`,
      );
    }
  } else {
    throw new RequestObjectVerificationError(
      "unsupported_alg",
      `alg ${header.alg} is not supported`,
    );
  }

  validateRequestObjectClaims(payload, client, opts);
  return payload;
}

function matchesAlg(jwk: Jwk, alg: SupportedAlg): boolean {
  if (jwk.alg && jwk.alg !== alg) return false;
  if (alg.startsWith("ES") && jwk.kty !== "EC") return false;
  if (alg.startsWith("RS") && jwk.kty !== "RSA") return false;
  return true;
}

function validateRequestObjectClaims(
  payload: Record<string, unknown>,
  client: RequestObjectClient,
  opts: VerifyRequestObjectOptions,
): void {
  const leeway = opts.leewaySeconds ?? 30;
  const nowSec = Math.floor((opts.now ? opts.now() : Date.now()) / 1000);

  // OIDC Core 6.1 / RFC 9101 don't strictly require `exp`, but without it a
  // request object can be replayed forever. Require a numeric exp.
  if (typeof payload.exp !== "number") {
    throw new RequestObjectVerificationError(
      "claim_invalid",
      "request object missing exp",
    );
  }
  if (payload.exp + leeway < nowSec) {
    throw new RequestObjectVerificationError(
      "claim_invalid",
      "request object is expired",
    );
  }
  if (typeof payload.nbf === "number" && payload.nbf - leeway > nowSec) {
    throw new RequestObjectVerificationError(
      "claim_invalid",
      "request object not yet valid",
    );
  }

  if (payload.iss !== undefined && payload.iss !== client.client_id) {
    throw new RequestObjectVerificationError(
      "claim_invalid",
      `iss mismatch: expected client_id ${client.client_id}, got ${String(payload.iss)}`,
    );
  }

  if (payload.aud !== undefined && opts.issuer) {
    const aud = payload.aud;
    const matches =
      aud === opts.issuer ||
      (Array.isArray(aud) && aud.some((a) => a === opts.issuer));
    if (!matches) {
      throw new RequestObjectVerificationError(
        "claim_invalid",
        `aud claim does not match issuer ${opts.issuer}`,
      );
    }
  }
}
