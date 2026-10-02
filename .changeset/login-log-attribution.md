---
"authhero": minor
"@authhero/adapter-interfaces": minor
---

`Successful Login` audit events now carry the original `/authorize` URL as `request.authorization_url`, and log streams deliver it in `details.request.authorization_url` so consumers can parse it (for example for `utm_*` attribution). It is not stored in the logs table. With the outbox enabled, `details.request.redirect_uri` and `details.execution_id` were previously dropped. They now survive the relay into the logs table and log streams. `AuditEvent` gains an optional `execution_id` and `request.authorization_url`.
