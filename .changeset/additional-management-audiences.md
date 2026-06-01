---
"authhero": minor
---

Add `additionalManagementAudiences` resolver on `init()` to extend the audiences accepted by the management API beyond the built-in `urn:authhero:management`. The resolver receives the token's `tenant_id` and returns the list of accepted audiences, so a per-tenant identifier (e.g. `https://${tenant_id}.token.example.com/v2/api/`) can be constructed at request time alongside any global legacy identifiers. The default audience is always accepted; the resolver is purely additive.
