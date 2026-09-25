import { Jwk, decodeBase64Url } from "@authhero/adapter-interfaces";
import { importParamsForJwk, SupportedAlg } from "./jwk-alg";

/**
 * Asymmetric JWS signature verification against a set of public JWKs.
 *
 * Shared by RFC 7523 client assertions (`helpers/client-assertion.ts`) and
 * Custom Token Exchange subject tokens, which both verify a compact JWS signed
 * by a party that registered its keys with us. Claim validation is left to
 * the caller because the two differ (iss/sub/aud rules).
 */

export const ASYMMETRIC_JWS_ALGS: readonly SupportedAlg[] = [
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
];

const RSA_VERIFY_PARAMS: AlgorithmIdentifier = { name: "RSASSA-PKCS1-v1_5" };
const EC_HASH_BY_ALG: Record<string, string> = {
  ES256: "SHA-256",
  ES384: "SHA-384",
  ES512: "SHA-512",
};

export function isAsymmetricJwsAlg(alg: unknown): alg is SupportedAlg {
  return (
    typeof alg === "string" &&
    ASYMMETRIC_JWS_ALGS.some((candidate) => candidate === alg)
  );
}

export function jwkMatchesAlg(jwk: Jwk, alg: SupportedAlg): boolean {
  if (jwk.alg && jwk.alg !== alg) return false;
  if (alg.startsWith("ES") && jwk.kty !== "EC") return false;
  if (alg.startsWith("RS") && jwk.kty !== "RSA") return false;
  return true;
}

export type JwsKeySelection =
  | { verified: true }
  | { verified: false; reason: "no_matching_key" | "bad_signature" };

/**
 * Verify `signature` over `signedInput` with the JWKs that could have produced
 * it: the one named by `kid` when the header carries one, otherwise every key
 * compatible with `alg`. Keys that fail to import are skipped.
 */
export async function verifyAsymmetricJwsSignature(params: {
  signedInput: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
  alg: SupportedAlg;
  kid?: string;
  jwks: Jwk[];
}): Promise<JwsKeySelection> {
  const { signedInput, signature, alg, kid, jwks } = params;

  const candidates = (kid ? jwks.filter((k) => k.kid === kid) : jwks).filter(
    (k) => jwkMatchesAlg(k, alg),
  );
  if (candidates.length === 0) {
    return { verified: false, reason: "no_matching_key" };
  }

  for (const candidate of candidates) {
    let cryptoKey: CryptoKey;
    try {
      cryptoKey = await crypto.subtle.importKey(
        "jwk",
        candidate,
        importParamsForJwk(candidate, alg),
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
        return { verified: true };
      }
    } catch {
      continue;
    }
  }

  return { verified: false, reason: "bad_signature" };
}

export interface DecodedCompactJws {
  header: { alg?: unknown; kid?: unknown; typ?: unknown };
  payload: Record<string, unknown>;
  signedInput: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
}

function decodeJsonObject(segment: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(segment)),
    );
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return null;
    return Object.fromEntries(Object.entries(parsed));
  } catch {
    return null;
  }
}

/**
 * Split and decode a compact JWS without verifying it. Returns null when the
 * token is not a 3-part JWS with JSON-object header and payload.
 */
export function decodeCompactJws(token: string): DecodedCompactJws | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerSeg, payloadSeg, signatureSeg] = parts;
  if (!headerSeg || !payloadSeg || !signatureSeg) return null;

  const header = decodeJsonObject(headerSeg);
  const payload = decodeJsonObject(payloadSeg);
  if (!header || !payload) return null;

  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = new Uint8Array(decodeBase64Url(signatureSeg));
  } catch {
    return null;
  }

  return {
    header,
    payload,
    signedInput: new Uint8Array(
      new TextEncoder().encode(`${headerSeg}.${payloadSeg}`),
    ),
    signature,
  };
}
