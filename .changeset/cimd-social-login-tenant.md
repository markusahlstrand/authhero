---
"authhero": patch
---

Fix CIMD (MCP client) login failing after a social/redirect connection. The
social-login `/callback` and `/authorize/resume` routes resolve their tenant
from the login-session state rather than the host, so they called
`getEnrichedClient` without a tenant. For CIMD clients this threw
`tenant_id is required to resolve a CIMD client`, dead-ending the flow at
`/u/login/identifier?error=access_denied` (e.g. after logging in with Google),
while email/OTP kept working. `getEnrichedClient` now recovers the tenant from
the CIMD stub row upserted on the first `/authorize`.
