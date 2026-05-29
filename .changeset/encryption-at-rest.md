---
"authhero": minor
"create-authhero": minor
---

Add optional at-rest encryption for sensitive credential fields. Set the `ENCRYPTION_KEY` binding (base64-encoded 32 bytes) and wrap the data adapter with the new `createEncryptedDataAdapter` to transparently AES-256-GCM-encrypt `clients.client_secret`, upstream secrets in `connections.options`, `email_providers.credentials`, `authentication_methods.totp_secret`, and `migration_sources.credentials`. Existing plaintext rows keep working via an `enc:v1:` version prefix and migrate lazily on write. When `ENCRYPTION_KEY` is unset, behavior is unchanged.

`create-authhero` now enables this by default: scaffolded projects (local, cloudflare, aws-sst) generate a random `ENCRYPTION_KEY` into their dev env file (`.env` / `.dev.vars`) and wire `createEncryptedDataAdapter` into both the server entry and the seed script. Production deployments should set their own key (`wrangler secret put ENCRYPTION_KEY` for Cloudflare, a stage env/secret for AWS).
