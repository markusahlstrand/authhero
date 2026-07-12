import { encodeBase64Url } from "@authhero/adapter-interfaces";

// OIDC Core 3.3.2.11 / 3.1.3.6: c_hash and at_hash are computed by hashing the
// ASCII representation of the code or access_token with the hash function
// matching the id_token's JWS alg (SHA-256 for *256, SHA-384 for *384,
// SHA-512 for *512), taking the left-most half of the bytes, and base64url-
// encoding without padding.
const ALG_TO_DIGEST: Record<string, string> = {
  RS256: "SHA-256",
  RS384: "SHA-384",
  RS512: "SHA-512",
  ES256: "SHA-256",
  ES384: "SHA-384",
  ES512: "SHA-512",
  HS256: "SHA-256",
  HS384: "SHA-384",
  HS512: "SHA-512",
};

export async function computeIdTokenHash(
  value: string,
  signingAlg: string,
): Promise<string> {
  const digest = ALG_TO_DIGEST[signingAlg];
  if (!digest) {
    throw new Error(
      `Cannot compute id_token hash: unsupported signing alg ${signingAlg}`,
    );
  }
  const encoded = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest(digest, encoded);
  const full = new Uint8Array(hashBuffer);
  const half = full.slice(0, full.length / 2);
  return encodeBase64Url(half);
}
