/**
 * Base32 (RFC 4648 §6, uppercase alphabet), the canonical implementation
 * for the AuthHero packages. Replaces the `oslo/encoding` dependency we
 * are migrating away from.
 *
 * The primary consumer is TOTP secret handling (RFC 6238 secrets are
 * conventionally shared as unpadded base32). Encoding is padding-free;
 * decoding is lenient and accepts input with or without padding.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Encode raw bytes as a padding-free base32 string. */
export function encodeBase32(bytes: Uint8Array): string {
  let result = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(buffer >> bits) & 31];
    }
  }
  if (bits > 0) {
    result += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return result;
}

/** Decode a base32 string (with or without padding) back to raw bytes. */
export function decodeBase32(input: string): Uint8Array {
  const clean = input.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}
