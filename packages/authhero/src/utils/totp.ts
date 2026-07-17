import { encodeBase32 } from "@authhero/adapter-interfaces";

/**
 * RFC 6238 TOTP on Web Crypto (HMAC-SHA1, 6 digits, 30-second period —
 * the authenticator-app defaults), replacing oslo/otp.
 */

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

async function generateHOTP(
  secret: Uint8Array,
  counter: number,
): Promise<string> {
  const counterBytes = new Uint8Array(8);
  new DataView(counterBytes.buffer).setBigUint64(0, BigInt(counter));

  const keyBuffer = new ArrayBuffer(secret.byteLength);
  new Uint8Array(keyBuffer).set(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const hs = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, counterBytes),
  );

  // RFC 4226 §5.3 dynamic truncation: the low nibble of the last byte picks
  // the offset of a 31-bit big-endian slice.
  const offset = hs[hs.length - 1]! & 0xf;
  const binCode =
    ((hs[offset]! & 0x7f) << 24) |
    (hs[offset + 1]! << 16) |
    (hs[offset + 2]! << 8) |
    hs[offset + 3]!;
  return (binCode % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

/** The TOTP code for the current 30-second period. */
export async function generateTOTP(secret: Uint8Array): Promise<string> {
  const counter = Math.floor(Date.now() / (TOTP_PERIOD_SECONDS * 1000));
  return generateHOTP(secret, counter);
}

/**
 * Verify a code against the current period ±1 (RFC 6238 §6 recommends
 * tolerating one step of transmission delay / clock drift, and oslo's
 * current-slice-only check made codes fail at period boundaries).
 */
export async function verifyTOTP(
  code: string,
  secret: Uint8Array,
): Promise<boolean> {
  const counter = Math.floor(Date.now() / (TOTP_PERIOD_SECONDS * 1000));
  for (const step of [0, -1, 1]) {
    if ((await generateHOTP(secret, counter + step)) === code) {
      return true;
    }
  }
  return false;
}

/** otpauth:// URI for enrolling the secret in an authenticator app. */
export function createTOTPKeyURI(
  issuer: string,
  accountName: string,
  secret: Uint8Array,
): string {
  const params = new URLSearchParams({
    secret: encodeBase32(secret),
    issuer,
  });
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(
    accountName,
  )}?${params.toString()}`;
}
