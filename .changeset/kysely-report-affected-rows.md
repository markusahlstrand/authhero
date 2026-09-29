---
"@authhero/kysely-adapter": patch
---

Fix `sessions.remove`, `sessions.update`, and `refreshTokens.remove` to report whether a row was actually affected. They previously returned `!!results.length` on the result of `execute()`, which resolves to one result object per statement even when zero rows matched — so the adapter always reported success.

**Behaviour change:** `DELETE /api/v2/sessions/{id}`, `POST /api/v2/sessions/{id}/revoke`, and `DELETE /api/v2/refresh-tokens/{id}` now answer `404` for an unknown id or an id belonging to another tenant, instead of `200`/`202`. They already answered `404` when the underlying adapter reported no row affected — only the (always-true) boolean was wrong.
