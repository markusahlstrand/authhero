---
"authhero": minor
"@authhero/adapter-interfaces": minor
---

`Successful Login` logs now record the login's marketing attribution in `details.request.attribution`. It's read from the original `/authorize` URL, keeping only `utm_*`, `gclid`, `fbclid` and `msclkid`, with bounded sizes. With the outbox enabled, `details.request.redirect_uri` and `details.execution_id` were previously dropped. They now survive the relay into the logs table and log streams. `AuditEvent` gains an optional `execution_id` and `request.attribution`.
