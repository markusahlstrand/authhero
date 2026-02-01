/**
 * Replacement utilities for oslo package functionality
 * These are simple implementations to replace oslo/encoding, oslo/crypto, oslo/request, and oslo/oauth2
 */

/**
 * Encode a Uint8Array to a hex string (lowercase)
 */
export function encodeHex(data: Uint8Array): string {
  return Array.from(data)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Encode a Uint8Array to base64 string
 */
export function encodeBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]!);
  }
  return btoa(binary);
}

/**
 * Decode a base64 string to Uint8Array
 */
export function decodeBase64(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode a Uint8Array to base64url string (URL-safe base64 without padding)
 */
export function encodeBase64url(
  data: Uint8Array,
  options?: { includePadding?: boolean },
): string {
  let base64 = encodeBase64(data);
  // Convert to base64url: replace + with -, / with _, remove padding
  base64 = base64.replace(/\+/g, "-").replace(/\//g, "_");
  if (!options?.includePadding) {
    base64 = base64.replace(/=+$/, "");
  }
  return base64;
}

/**
 * Decode a base64url string to Uint8Array
 */
export function decodeBase64url(encoded: string): Uint8Array {
  // Convert from base64url to base64: replace - with +, _ with /
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  while (base64.length % 4) {
    base64 += "=";
  }
  return decodeBase64(base64);
}

/**
 * Compute SHA-256 hash of data
 * Returns Uint8Array for easier consumption
 */
export async function sha256(
  data: Uint8Array | ArrayBuffer,
): Promise<Uint8Array> {
  const result = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return new Uint8Array(result);
}

/**
 * Verify that the request origin matches one of the allowed origins
 * Replaces oslo/request verifyRequestOrigin
 *
 * allowedOrigins can be:
 * - Full URLs (e.g., "https://example.com")
 * - Just hostnames (e.g., "example.com")
 */
export function verifyRequestOrigin(
  origin: string | null | undefined,
  allowedOrigins: string[],
): boolean {
  if (!origin) {
    return false;
  }

  let originHost: string;
  try {
    const originUrl = new URL(origin);
    originHost = originUrl.host;
  } catch {
    return false;
  }

  for (const allowed of allowedOrigins) {
    // Check if the allowed origin is a full URL or just a host
    try {
      const allowedUrl = new URL(allowed);
      // It's a full URL - compare the full origin (scheme + host)
      const normalizedOrigin = origin.replace(/\/+$/, "");
      const normalizedAllowed = `${allowedUrl.protocol}//${allowedUrl.host}`;
      if (normalizedOrigin === normalizedAllowed) {
        return true;
      }
    } catch {
      // It's just a host - compare hosts only
      if (originHost === allowed) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Generate a cryptographically secure code verifier for OAuth2 PKCE
 * Replaces oslo/oauth2 generateCodeVerifier
 * Returns a 43-character base64url-encoded string (256 bits of entropy)
 */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(bytes);
  return encodeBase64url(bytes);
}
