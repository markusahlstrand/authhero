---
"@authhero/adapter-interfaces": patch
"authhero": patch
---

Record the login target (`redirect_uri`) on authentication logs. The
`SUCCESS_LOGIN` event now carries the RP `redirect_uri` on its request details
(`details.request.redirect_uri` in flat logs, `request.redirect_uri` on the
outbox audit event), so a login can be attributed to a specific destination
even when several flows share one `client_id` — e.g. a browser SPA and a
server-side OIDC plugin authorizing as the same client. `logMessage` gains an
optional `redirect_uri` param and `requestContextSchema` gains an optional
`redirect_uri` field.
