/**
 * Lowercase hex encoding, the canonical implementation for the AuthHero
 * packages. Replaces the `oslo/encoding` dependency we are migrating
 * away from.
 */

/** Encode bytes as a lowercase hex string. Accepts an ArrayBuffer so
 * Web Crypto digest/thumbprint results can be passed directly. */
export function encodeHex(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
