---
"authhero": minor
---

Add control-plane mode to `/connect/start` so it can be used from a multi-tenancy control plane.

Previously the consent flow always minted the IAT on whichever tenant the request resolved to. That meant integrators had to point `/connect/start` at each child tenant's host directly — there was no way to start the flow on a shared control-plane host (e.g. `auth2.sesamy.com`) and have the IAT land on the user's chosen workspace.

The flow now branches based on the resolved tenant:

- **Direct-to-child (unchanged):** request resolves to a child tenant → mint the IAT there. No new behavior.
- **Control plane:** request resolves to the multi-tenancy control plane (detected via `data.multiTenancyConfig.controlPlaneTenantId`, set by `@authhero/multi-tenancy`'s `withRuntimeFallback`) → after login, the user is shown a new `/u2/connect/select-tenant` picker listing every organization they belong to on the control plane. Each organization name maps 1:1 to a child tenant id (the convention enforced by the provisioning hooks). The chosen child tenant is persisted on the login session and the IAT is minted against that tenant.

Membership is re-validated when consent is submitted, so a stale or tampered `target_tenant_id` cannot be used to mint on a workspace the user has lost access to.

When the IAT lives on a different tenant than the request resolved against, the success redirect adds `authhero_tenant=<child_tenant_id>` alongside `authhero_iat`. Pass it as the `tenant-id` header on `POST /oidc/register` so registration hits the correct tenant. Direct-to-child callers don't get this parameter.
