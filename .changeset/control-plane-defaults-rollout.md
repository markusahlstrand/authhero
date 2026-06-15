---
"authhero": minor
"@authhero/multi-tenancy": minor
---

Add control-plane defaults projection for Workers-for-Platforms tenants, plus keyed (multi-key) encryption at rest.

WFP tenants run in their own Worker with their own database and cannot read the control plane's database at request time, so runtime fallback has nothing to resolve against. Instead, the control plane's inheritable defaults (connections, `is_system` resource servers, `inheritable` hooks, email provider, branding, prompt settings) are now **projected into each tenant's own database under the control plane tenant id** — the existing `withRuntimeFallback` resolves them with no read-path change.

`@authhero/multi-tenancy` adds:

- `projectControlPlaneDefaults(config, targetTenantId)` — idempotent (upsert-by-id) projection of the control plane's defaults bundle into a tenant database.
- `createDirectRolloutAdapter(config)` returning a `ControlPlaneRolloutAdapter` (`syncDefaults` / `syncDefaultsToTenants`). The adapter is the seam for execution strategy: inline today, swappable for a durable Cloudflare Workflows implementation later without changing callers.

`authhero` adds keyed encryption so a tenant can hold inherited secrets at rest without being able to decrypt them:

- The `enc:v1:` field-encryption format gains an optional key id (`enc:v1:<keyId>:<payload>`), fully backward compatible with existing unkeyed values.
- `createEncryptedDataAdapterWithKeyRing(data, ring, { resolveEncryptKeyId })` encrypts each tenant's secrets under a key selected from a `KeyRing` (e.g. control-plane-tenant rows under a control-plane-only key id), choosing the key on read from the id embedded in the ciphertext.
- New low-level helpers `encryptFieldWithRing`, `decryptFieldWithRing`, `parseKeyId`, and the `KeyRing` / `EncryptKeyIdResolver` types.

Existing single-key `createEncryptedDataAdapter` and all current ciphertext are unchanged.
