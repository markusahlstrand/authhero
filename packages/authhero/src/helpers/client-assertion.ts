import { Jwk, decodeBase64Url } from "@authhero/adapter-interfaces";
import { importParamsForJwk, SupportedAlg } from "../utils/jwk-alg";
import {
  loadClientJwks,
  LoadClientKeysOptions,
  ClientWithKeys,
} from "./client-keys";

const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

const SUPPORTED_ASYMMETRIC_ALGS = new Set<SupportedAlg>([
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
]);

const SUPPORTED_SYMMETRIC_ALGS = new Set(["HS256", "HS384", "HS512"]);

/**
 * Default upper bound on a client assertion's lifetime. RFC 7523 gives no
 * limit, so without one a client can mint an assertion valid for a year and a
 * captured assertion stays usable for that whole window. 300s matches the
 * usual guidance for a single-use token presented directly to the endpoint.
 */
const DEFAULT_MAX_LIFETIME_SECONDS = 300;

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

export type ClientAssertionMethod = "private_key_jwt" | "client_secret_jwt";

export class ClientAssertionError extends Error {
  constructor(
    public code:
      | "invalid_client"
      | "invalid_request"
      | "unsupported_alg"
      | "missing_keys",
    message: string,
  ) {
    super(message);
    this.name = "ClientAssertionError";
  }
}

export interface ClientAssertionClient extends ClientWithKeys {
  client_id: string;
  client_secret?: string | undefined;
}

export interface VerifyClientAssertionOptions extends LoadClientKeysOptions {
  /**
   * Acceptable values for the `aud` claim. Per RFC 7523 §3 the assertion's
   * audience MUST identify the authorization server, typically as the token
   * endpoint URL or the issuer. We accept either.
   */
  acceptedAudiences: string[];
  /** Clock-skew leeway in seconds. Defaults to 30. */
  leewaySeconds?: number;
  /**
   * Maximum accepted assertion lifetime in seconds. Rejects an assertion whose
   * `exp - iat` exceeds this, and caps the absolute `exp` at `now + max` so an
   * assertion that omits `iat` cannot sidestep the bound. Defaults to
   * DEFAULT_MAX_LIFETIME_SECONDS (300) — the window a captured assertion stays
   * replayable in is bounded by this, so keep it short.
   */
  maxLifetimeSeconds?: number;
  /** Override Date.now() for tests. */
  now?: () => number;
}

interface JoseHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

export interface VerifiedClientAssertion {
  /** The authenticated client_id (extracted from the assertion's `sub`). */
  clientId: string;
  /** Which authentication method was actually used. */
  method: ClientAssertionMethod;
  /**
   * The `jti` claim, when present. `consumeClientAssertionJti`
   * (helpers/client-assertion-replay.ts) spends it so an assertion cannot be
   * presented twice; the token endpoint calls that after this verifier
   * returns.
   */
  jti?: string;
  /** The `exp` claim, in seconds. Bounds how long the `jti` must be remembered. */
  exp: number;
  /** The full verified payload, in case callers need other claims. */
  payload: Record<string, unknown>;
}

function decodeJoseSegment<T = unknown>(segment: string): T {
  const decoded = new TextDecoder().decode(decodeBase64Url(segment));
  const parsed = JSON.parse(decoded);
  if (typeof parsed !== "object" || parsed === null) {
    throw new ClientAssertionError(
      "invalid_request",
      "JOSE segment is not an object",
    );
  }
  return parsed as T;
}

/**
 * Verify an RFC 7523 client assertion JWT. Used by the `/oauth/token` endpoint
 * to authenticate clients that registered with `token_endpoint_auth_method`
 * = `private_key_jwt` or `client_secret_jwt`.
 *
 * The caller has already resolved the client (typically via the assertion's
 * `iss`/`sub` claim or an explicit `client_id` form param). This function
 * verifies that the assertion is signed by a key the client owns and that the
 * standard claims are correct.
 *
 * @throws ClientAssertionError when the assertion is malformed, signed with
 *   an unsupported alg, signed with a key the client doesn't own, or fails
 *   any of the iss/sub/aud/exp checks.
 */
export async function verifyClientAssertion(
  assertion: string,
  client: ClientAssertionClient,
  opts: VerifyClientAssertionOptions,
): Promise<VerifiedClientAssertion> {
  const parts = assertion.split(".");
  if (parts.length !== 3) {
    throw new ClientAssertionError(
      "invalid_request",
      "client_assertion is not a 3-part JWS",
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
    if (e instanceof ClientAssertionError) throw e;
    throw new ClientAssertionError(
      "invalid_request",
      "failed to decode client_assertion JOSE segments",
    );
  }

  if (!header.alg) {
    throw new ClientAssertionError("invalid_request", "missing alg in header");
  }
  if (header.alg === "none") {
    throw new ClientAssertionError(
      "unsupported_alg",
      "alg=none is not accepted for client authentication",
    );
  }

  const signedInput = new Uint8Array(
    new TextEncoder().encode(`${headerSeg}.${payloadSeg}`),
  );
  const signature = new Uint8Array(decodeBase64Url(signatureSeg));

  let method: ClientAssertionMethod;

  if (SUPPORTED_SYMMETRIC_ALGS.has(header.alg)) {
    if (!client.client_secret) {
      throw new ClientAssertionError(
        "invalid_client",
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
      throw new ClientAssertionError(
        "invalid_client",
        "HMAC signature did not verify",
      );
    }
    method = "client_secret_jwt";
  } else if (SUPPORTED_ASYMMETRIC_ALGS.has(header.alg as SupportedAlg)) {
    const alg = header.alg as SupportedAlg;
    const jwks = await loadClientJwks(client, { fetch: opts.fetch });
    if (jwks.length === 0) {
      throw new ClientAssertionError(
        "missing_keys",
        "client has no jwks/jwks_uri registered",
      );
    }
    const candidates: Jwk[] = header.kid
      ? jwks.filter((k) => k.kid === header.kid)
      : jwks.filter((k) => matchesAlg(k, alg));
    if (candidates.length === 0) {
      throw new ClientAssertionError(
        "missing_keys",
        header.kid
          ? `no JWK found with kid=${header.kid}`
          : `no JWK found for alg=${alg}`,
      );
    }
    let verified = false;
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
      throw new ClientAssertionError(
        "invalid_client",
        "asymmetric signature did not verify",
      );
    }
    method = "private_key_jwt";
  } else {
    throw new ClientAssertionError(
      "unsupported_alg",
      `alg ${header.alg} is not supported`,
    );
  }

  validateClaims(payload, client, opts);

  const sub = String(payload.sub);
  return {
    clientId: sub,
    method,
    jti: typeof payload.jti === "string" ? payload.jti : undefined,
    // validateClaims has already rejected a non-numeric exp.
    exp: payload.exp as number,
    payload,
  };
}

function matchesAlg(jwk: Jwk, alg: SupportedAlg): boolean {
  if (jwk.alg && jwk.alg !== alg) return false;
  if (alg.startsWith("ES") && jwk.kty !== "EC") return false;
  if (alg.startsWith("RS") && jwk.kty !== "RSA") return false;
  return true;
}

function validateClaims(
  payload: Record<string, unknown>,
  client: ClientAssertionClient,
  opts: VerifyClientAssertionOptions,
): void {
  const leeway = opts.leewaySeconds ?? 30;
  const nowSec = Math.floor((opts.now ? opts.now() : Date.now()) / 1000);

  // RFC 7523 §3: iss = sub = client_id (when used at the token endpoint).
  if (payload.iss !== client.client_id) {
    throw new ClientAssertionError(
      "invalid_client",
      `iss must be the client_id (got ${String(payload.iss)})`,
    );
  }
  if (payload.sub !== client.client_id) {
    throw new ClientAssertionError(
      "invalid_client",
      `sub must be the client_id (got ${String(payload.sub)})`,
    );
  }

  if (typeof payload.exp !== "number") {
    throw new ClientAssertionError("invalid_client", "exp claim is required");
  }
  if (payload.exp + leeway < nowSec) {
    throw new ClientAssertionError(
      "invalid_client",
      "client_assertion is expired",
    );
  }

  // Bound how long an assertion is valid for. Checked two ways because `iat`
  // is optional in RFC 7523 §3: when it is present the stated lifetime must
  // fit the bound, and either way the absolute expiry must fall inside the
  // same window measured from now.
  const maxLifetime = opts.maxLifetimeSeconds ?? DEFAULT_MAX_LIFETIME_SECONDS;
  if (
    typeof payload.iat === "number" &&
    payload.exp - payload.iat > maxLifetime
  ) {
    throw new ClientAssertionError(
      "invalid_client",
      `client_assertion lifetime (exp - iat) must not exceed ${maxLifetime}s`,
    );
  }
  if (payload.exp - leeway > nowSec + maxLifetime) {
    throw new ClientAssertionError(
      "invalid_client",
      `client_assertion must not expire more than ${maxLifetime}s from now`,
    );
  }

  if (typeof payload.nbf === "number" && payload.nbf - leeway > nowSec) {
    throw new ClientAssertionError(
      "invalid_client",
      "client_assertion is not yet valid",
    );
  }

  // Audience must include one of the accepted values (token endpoint URL or
  // issuer URL). RFC 7523 §3.
  const aud = payload.aud;
  const audValues =
    typeof aud === "string"
      ? [aud]
      : Array.isArray(aud)
        ? aud.filter((v): v is string => typeof v === "string")
        : [];
  if (audValues.length === 0) {
    throw new ClientAssertionError("invalid_client", "aud claim is required");
  }
  const audOk = audValues.some((v) => opts.acceptedAudiences.includes(v));
  if (!audOk) {
    throw new ClientAssertionError(
      "invalid_client",
      `aud claim must include one of: ${opts.acceptedAudiences.join(", ")}`,
    );
  }
}

export {
  ASSERTION_TYPE as CLIENT_ASSERTION_TYPE,
  DEFAULT_MAX_LIFETIME_SECONDS as CLIENT_ASSERTION_DEFAULT_MAX_LIFETIME_SECONDS,
};
