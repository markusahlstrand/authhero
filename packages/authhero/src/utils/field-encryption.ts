import { base64, base64url } from "oslo/encoding";

// Version-tagged prefix for encrypted field values. Stored values that do not
// start with this prefix are treated as legacy plaintext and returned as-is,
// which lets existing rows migrate lazily as they are rewritten.
const PREFIX = "enc:v1:";
const IV_BYTES = 12; // AES-GCM standard nonce size

export type EncryptedField = `${typeof PREFIX}${string}`;

export function isEncrypted(value: string): value is EncryptedField {
  return value.startsWith(PREFIX);
}

// Copy into a freshly allocated ArrayBuffer so the value satisfies the Web
// Crypto BufferSource typing (which requires an ArrayBuffer rather than a
// possibly-SharedArrayBuffer-backed view).
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(view.byteLength);
  new Uint8Array(buffer).set(view);
  return buffer;
}

/**
 * Imports a base64-encoded 32-byte key as an AES-256-GCM CryptoKey. Throws if
 * the decoded key is not exactly 32 bytes so a misconfigured secret fails loudly
 * at boot rather than silently weakening encryption.
 */
export async function loadEncryptionKey(b64: string): Promise<CryptoKey> {
  const raw = base64.decode(b64);
  if (raw.byteLength !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode to 32 bytes (got ${raw.byteLength}). Generate one with: openssl rand -base64 32`,
    );
  }
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(raw),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypts a string with AES-256-GCM using a fresh random IV. The output is
 * `enc:v1:<base64url(iv ‖ ciphertext ‖ tag)>`.
 */
export async function encryptField(
  plaintext: string,
  key: CryptoKey,
): Promise<EncryptedField> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  return `${PREFIX}${base64url.encode(combined)}`;
}

/**
 * Decrypts a value produced by `encryptField`. Values without the `enc:v1:`
 * prefix are assumed to be legacy plaintext and returned unchanged. Throws if a
 * prefixed value cannot be decrypted (wrong key or corrupted ciphertext).
 */
export async function decryptField(
  value: string,
  key: CryptoKey,
): Promise<string> {
  if (!isEncrypted(value)) {
    return value;
  }

  const combined = base64url.decode(value.slice(PREFIX.length));
  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}
