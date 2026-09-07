---
"authhero": patch
---

Surface scopes that the resource server does not define when a client grant is created or updated. By default the management API accepts the write, as Auth0 does, and logs a warning naming the undefined scopes; tenants that have set the `restrict_undefined_scopes` flag get the write rejected with a 400 instead. Grants whose audience has no matching resource server are left untouched.
