---
"authhero": patch
---

Management API auth middleware now also accepts the reversed `resource:verb` scope form (e.g. `users:read`, `users:write`) alongside the canonical Auth0 `verb:resource` form (`read:users`, `update:users`). Tokens minted by upstream systems that use either convention will be accepted without requiring per-route changes.
