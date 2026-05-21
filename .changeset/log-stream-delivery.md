---
"authhero": minor
"@authhero/admin": minor
---

Deliver audit events to tenant-configured HTTP log streams. The new `LogStreamDestination` is wired into the outbox pipeline (both inline and via `createDefaultDestinations`) and POSTs each event to every active HTTP log stream for the tenant. The sink shape mirrors Auth0's (`http_endpoint`, `http_authorization`, `http_content_type`, `http_content_format`, `http_custom_headers`), and `filters` are honored against `log_type`. Admin UI gains a Log Streams resource for managing HTTP sinks.
