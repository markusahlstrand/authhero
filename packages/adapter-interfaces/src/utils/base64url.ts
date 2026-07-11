/**
 * URL-safe base64 ("base64url", RFC 4648 §5) without padding.
 *
 * This is the canonical base64url implementation for the AuthHero packages.
 * It lives in `adapter-interfaces` (the lowest package) so every other package
 * can depend on it, replacing scattered hand-rolled `btoa/atob` variants and
 * the `oslo/encoding` dependency we are migrating away from.
 *
 * Both byte- and string-oriented helpers are provided:
 *  - `encodeBase64Url` / `decodeBase64Url` work on raw bytes (`Uint8Array`),
 *    matching how most callers use it (hashes, random bytes, JWT segments).
 *  - `encodeBase64UrlString` / `decodeBase64UrlString` wrap those with UTF-8
 *    (de)coding for the common "encode a JSON/text payload" case.
 */

/** Encode raw bytes as a padding-free base64url string. */
export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode a base64url string (with or without padding) back to raw bytes. */
export function decodeBase64Url(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Encode a UTF-8 string as a padding-free base64url string. */
export function encodeBase64UrlString(input: string): string {
  return encodeBase64Url(new TextEncoder().encode(input));
}

/** Decode a base64url string produced from UTF-8 text back to that string. */
export function decodeBase64UrlString(input: string): string {
  return new TextDecoder().decode(decodeBase64Url(input));
}
