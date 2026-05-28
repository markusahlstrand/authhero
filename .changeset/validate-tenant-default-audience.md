---
"authhero": patch
---

Validate `tenant.default_audience` against existing resource servers. Setting `default_audience` to an identifier that has no matching resource server is now rejected with 400 on `PATCH /tenants/settings`, and deleting a resource server that is still referenced as the tenant's `default_audience` is rejected with 409. Previously such mismatches put the tenant in a broken state where every `/authorize` request was rejected with `Service not found`. Tenants already in that state are not auto-fixed — operators should clear `default_audience` or create a resource server with the matching identifier.
