---
title: Encryption at Rest
description: Optional application-level encryption of sensitive credential fields stored in the AuthHero database.
---

# Encryption at Rest

By default AuthHero stores most credential fields in plaintext, trusting the database layer. For defense-in-depth against a database-only compromise (a stolen backup, a read-only SQL injection, an accidental dump), AuthHero can transparently encrypt sensitive fields at the application layer using a single symmetric key supplied via the environment.

This protects data **only** against attackers who can read the database but not the running application — the application must hold the key in memory to operate. It is the same model Auth0/Okta use for storing retrievable secrets like client secrets.

## Enabling it

Generate a 32-byte key and expose it as `ENCRYPTION_KEY`:

```bash
openssl rand -base64 32
```

Then wrap your data adapter before passing it to AuthHero:

```ts
import { createEncryptedDataAdapter, loadEncryptionKey } from "authhero";

let dataAdapter = createAdapters(db);

if (process.env.ENCRYPTION_KEY) {
  const key = await loadEncryptionKey(process.env.ENCRYPTION_KEY);
  dataAdapter = createEncryptedDataAdapter(dataAdapter, key);
}
```

When `ENCRYPTION_KEY` is unset the wrapper is not installed and behavior is unchanged, so enabling encryption is opt-in and zero-config for existing deployments.

## What gets encrypted

| Table | Field |
| --- | --- |
| `clients` | `client_secret` |
| `connections` | `options.client_secret`, `options.app_secret`, `options.twilio_token`, `options.configuration.client_secret` |
| `email_providers` | `credentials` (all string values) |
| `authentication_methods` | `totp_secret` |
| `migration_sources` | `credentials.client_secret` |

Non-sensitive keys (e.g. `connections.options.client_id`) are left in plaintext so they remain queryable and inspectable.

### Not covered

Private keys are intentionally **not** encrypted by this mechanism: `keys.pkcs7` (JWT signing keys) and `dkim_private_key`. These are better protected with envelope encryption and are left for a future iteration.

## How it works

Encrypted values are AES-256-GCM ciphertext with a random 96-bit IV, stored as `enc:v1:<base64url(iv ‖ ciphertext ‖ tag)>`. The `enc:v1:` prefix is a version marker.

Reads are prefix-aware: a stored value without the `enc:v1:` prefix is treated as legacy plaintext and returned unchanged. This means **existing rows keep working** after you enable encryption — they migrate to ciphertext lazily, the next time the field is written. No migration script is required.

## Key rotation

V1 supports a single active key. Rotating to a new key requires re-encrypting existing rows; a dedicated `enc:v2:` format and re-encryption tooling are planned. Until then, treat the key as long-lived and store it in a secrets manager (Cloudflare Workers secret, AWS Secrets Manager, etc.). Losing the key makes encrypted fields unrecoverable.
