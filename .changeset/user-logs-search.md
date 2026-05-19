---
"authhero": patch
---

`GET /api/v2/users/{user_id}/logs` now honors the `q` query parameter. The caller-supplied Lucene query is ANDed with the user-id constraint (which already expands to include linked accounts), so admin UIs can filter a user's logs by `type`, `ip`, etc. Previously `q` was silently ignored and the endpoint always returned all logs for the user.
