---
"authhero": patch
---

Log a FAILED_EXCHANGE audit event when a credentials-exchange hook calls `api.access.deny()`. Previously a hook denial returned a 400 (after the authorization code had already been consumed) but left no failed-exchange log entry — the only trace was a "canceled" action-execution record. The denial is now recorded under the grant's matching `FAILED_EXCHANGE_*` log type with a description identifying the deny code.
