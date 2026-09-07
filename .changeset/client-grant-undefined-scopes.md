---
"authhero": patch
---

Surface scopes that the resource server does not define when a client grant is created or updated. The management API now logs the mismatch on every write, and rejects it with a 400 for tenants that have set the `restrict_undefined_scopes` flag. Grants whose audience has no matching resource server are left untouched.
