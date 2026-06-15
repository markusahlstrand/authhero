import { base64, base64url } from "oslo/encoding";

// Version-tagged prefix for encrypted field values. Stored values that do not
// start with this prefix are treated as legacy plaintext and returned as-is,
// which lets existing rows migrate lazily as they are rewritten.
const PREFIX = "enc:v1:";
const IV_BYTES = 12; // AES-GCM standard nonce size

// A key id may be embedded between the version prefix and the payload to select
// which key from a key ring decrypts the value:
//
//   enc:v1:<base64url(iv ‖ ciphertext ‖ tag)>            -> default key (legacy)
//   enc:v1:<keyId>:<base64url(iv ‖ ciphertext ‖ tag)>    -> ring.keys[keyId]
//
// base64url never contains ":", so the presence of a ":" in the remainder after
// the prefix unambiguously signals a keyed value. Key ids are restricted to a
// colon-free charset so the split stays unambiguous.
const KEY_ID_RE = /^[A-Za-z0-9_-]+$/;

export type EncryptedField = `${typeof PREFIX}${string}`;

export function isEncrypted(value: string): value is EncryptedField {
  return value.startsWith(PREFIX);
}

/**
 * A set of AES-256-GCM keys addressable by id. `default` decrypts (and by
 * default encrypts) legacy unkeyed `enc:v1:` values; `keys[id]` handles values
 * tagged with that id (`enc:v1:<id>:`).
 *
 * This is what lets a single database hold ciphertext under more than one key —
 * e.g. a WFP tenant's own secrets under the tenant key and inherited control
 * plane secrets under a control-plane-only key the tenant operator never holds.
 */
export interface KeyRing {
  default: CryptoKey;
  keys?: Record<string, CryptoKey>;
}

/**
 * The key id a keyed value was encrypted under, or `undefined` for a legacy
 * unkeyed value (or a non-encrypted plaintext).
 */
export function parseKeyId(value: string): string | undefined {
  if (!isEncrypted(value)) return undefined;
  const remainder = value.slice(PREFIX.length);
  const colon = remainder.indexOf(":");
  if (colon === -1) return undefined;
  return remainder.slice(0, colon);
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

// Core primitive: encrypt with an explicit key, optionally tagging the output
// with a key id so the matching key can be selected on read.
async function encryptWithKey(
  plaintext: string,
  key: CryptoKey,
  keyId?: string,
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

  const payload = base64url.encode(combined);
  return keyId ? `${PREFIX}${keyId}:${payload}` : `${PREFIX}${payload}`;
}

async function decryptWithKey(
  value: EncryptedField,
  key: CryptoKey,
): Promise<string> {
  const remainder = value.slice(PREFIX.length);
  const colon = remainder.indexOf(":");
  const payload = colon === -1 ? remainder : remainder.slice(colon + 1);

  const combined = base64url.decode(payload);
  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

/**
 * Encrypts a string with AES-256-GCM using a fresh random IV. The output is
 * `enc:v1:<base64url(iv ‖ ciphertext ‖ tag)>`.
 */
export async function encryptField(
  plaintext: string,
  key: CryptoKey,
): Promise<EncryptedField> {
  return encryptWithKey(plaintext, key);
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
  return decryptWithKey(value, key);
}

function resolveKey(ring: KeyRing, keyId: string | undefined): CryptoKey {
  if (!keyId) return ring.default;
  const key = ring.keys?.[keyId];
  if (!key) {
    throw new Error(
      `No key for id "${keyId}" in key ring (have: ${Object.keys(
        ring.keys ?? {},
      ).join(", ") || "none"}). The key binding for this id is missing.`,
    );
  }
  return key;
}

/**
 * Encrypts a value using a key ring, optionally tagging it with `keyId` so the
 * same key is selected on read. With no `keyId` the value is encrypted under the
 * ring's default key and is byte-compatible with `encryptField` (legacy form).
 */
export async function encryptFieldWithRing(
  plaintext: string,
  ring: KeyRing,
  keyId?: string,
): Promise<EncryptedField> {
  if (keyId && !KEY_ID_RE.test(keyId)) {
    throw new Error(
      `Invalid key id "${keyId}": only [A-Za-z0-9_-] are allowed.`,
    );
  }
  return encryptWithKey(plaintext, resolveKey(ring, keyId), keyId);
}

/**
 * Decrypts a value using a key ring, selecting the key from the id embedded in
 * the ciphertext (or the default key for legacy unkeyed values). Plaintext
 * values (no `enc:v1:` prefix) are returned unchanged.
 */
export async function decryptFieldWithRing(
  value: string,
  ring: KeyRing,
): Promise<string> {
  if (!isEncrypted(value)) {
    return value;
  }
  return decryptWithKey(value, resolveKey(ring, parseKeyId(value)));
}
