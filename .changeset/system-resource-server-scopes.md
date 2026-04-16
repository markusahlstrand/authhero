---
"@authhero/multi-tenancy": patch
---

Gate resource server scope inheritance on is_system flag and match by id instead of identifier. Apply scope inheritance to the management API adapter so is_system resource servers show their effective scopes from the control plane.
