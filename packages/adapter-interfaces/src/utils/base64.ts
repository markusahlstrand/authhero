/**
 * Standard base64 (RFC 4648 §4), the canonical implementation for the
 * AuthHero packages (see base64url.ts for the URL-safe variant). Replaces
 * the `oslo/encoding` dependency we are migrating away from.
 *
 * Encoding emits padding ("=") to match the conventional wire format
 * (PEM bodies, `openssl rand -base64` keys). Decoding is lenient and
 * accepts input with or without padding.
 */

/** Encode raw bytes as a padded standard-base64 string. */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/** Decode a standard-base64 string (with or without padding) to raw bytes. */
export function decodeBase64(input: string): Uint8Array {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
