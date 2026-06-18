---
"@authhero/multi-tenancy": minor
"authhero": minor
---

Add a transport-agnostic control-plane defaults **wire contract** to
`@authhero/multi-tenancy` for pushing shared state into per-tenant databases
(e.g. a Workers-for-Platforms tenant's D1):

- `buildControlPlaneDefaultsPayload(controlPlaneAdapters, controlPlaneTenantId, entities?)`
  reads the control plane's inheritable connections, `is_system` resource
  servers, `inheritable` hooks, email provider, branding, prompt settings, and
  its **public** `jwt_signing` keys into a `ControlPlaneDefaultsPayload`.
- `applyControlPlaneDefaultsPayload(payload, targetAdapters, controlPlaneTenantId, options?)`
  applies a payload to a tenant adapter, reusing the same idempotent upsert/filter
  path as `projectControlPlaneDefaults` and adding a dedicated signing-key path.

Signing keys are projected as a first-class but **security-sensitive** entity:
`pkcs7` (private key) is stripped on build and re-stripped on apply, keys are
stored with no `tenant_id` (so `listControlPlaneKeys` resolves them for
verification), and they are create-if-missing by `kid`.

`authhero` now exports `listControlPlaneKeys`, `resolveSigningKeys`, and
`resolveSigningKeyMode` so the control-plane key selection has a single source
of truth reused by the projection.
