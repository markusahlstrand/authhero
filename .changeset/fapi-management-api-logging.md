---
"authhero": patch
---

Log management API failures as `fapi` (Failed API Operation) entries in the tenant's log stream, matching Auth0's behavior. Previously a 4xx/5xx response from the management API was returned to the SDK but no log entry was written, so operators could see successful operations (`sapi`) but had no visibility into rejected ones. Now any management API request whose response status is 400-599 produces a `fapi` log entry with the status code and response body, regardless of whether the route threw or returned the error.

The auth middleware now populates principal context (`user_id`, `client_id`, `org_id`, etc.) from the validated JWT before evaluating audience and scope, so failed-authorization `fapi` entries are attributed to the actual caller instead of being anonymous.
