---
"authhero": patch
---

`/authorize` now uses only the parameters inside a signed Request Object (`request` or `request_uri`), as RFC 9101 §5 requires. Unsigned query parameters can no longer fill gaps in the signed payload. When a duplicate query value differs, the signed value is used instead of rejecting the request. The Request Object must contain a `client_id` that matches the outer `client_id` parameter. Signed requests are no longer filled in from a stored login session.
