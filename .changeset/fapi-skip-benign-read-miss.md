---
"authhero": patch
---

Don't log a `fapi` (Failed API Operation) event when a management-API `GET`
returns 404. A read miss — e.g. a client probing `GET /api/v2/users/{id}` for a
user that doesn't exist — is an expected outcome that real Auth0 doesn't surface
as an error-class log event; it just returns the 404. Non-GET 404s (and other
4xx/5xx responses) are still logged as before.
