#!/usr/bin/env node
import { loadEncryptionKey, decryptField } from "authhero";

// Decrypt a stored field value using ENCRYPTION_KEY from the environment.
// Usage: node --env-file=.env scripts/decrypt-field.mjs "enc:v1:..."
// Values without the enc:v1: prefix (legacy plaintext) are printed unchanged.
const value = process.argv[2];

if (!value) {
  console.error(
    'Usage: node --env-file=<env> scripts/decrypt-field.mjs "<value>"',
  );
  process.exit(1);
}

const keyB64 = process.env.ENCRYPTION_KEY;
if (!keyB64) {
  console.error(
    "ENCRYPTION_KEY is not set. Pass it via --env-file or the environment.",
  );
  process.exit(1);
}

try {
  const key = await loadEncryptionKey(keyB64);
  console.log(await decryptField(value, key));
} catch (error) {
  console.error(
    "Failed to decrypt:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
