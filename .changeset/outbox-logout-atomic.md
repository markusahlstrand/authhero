---
"authhero": patch
---

Commit the `SUCCESS_REVOCATION` outbox event atomically with refresh-token removal and session revocation in the logout route. Adds a `logMessageInTx` helper for use inside `data.transaction()` callbacks so future auth flows can do the same.
