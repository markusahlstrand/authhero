---
"authhero": patch
---

Stamp `sessions.used_at` when a session is actually used, so session retention analytics stop reporting 100% in week 0 and 0% in every later week.

Sessions are kept alive by refresh-token exchanges and by SSO re-authorization, but neither wrote to the `sessions` row — rotation bookkeeping all landed on `refresh_tokens`, and the SSO path only appended to `clients`. Retention buckets each session by `COALESCE(used_at_ts, created_at_ts)`, so every session looked like it was last seen in the week it was created and the cohort triangle collapsed.

The refresh-token grant now stamps `used_at` off the request's critical path (read and write both run under `waitUntil`). The SSO-reuse path folds the stamp into the client-association update when it is already making one, and otherwise stamps off the critical path too — a failed analytics write must never reject a re-authorization that has otherwise succeeded. Both are throttled to roughly one write per hour per session, so a client refreshing every few minutes costs about one `sessions` write an hour rather than one per exchange. The throttle reads the current stamp before writing rather than comparing-and-setting, so concurrent uses of the same session can occasionally write more than once in a window — that costs a redundant write, nothing more.

Cohorts fill in from the deploy forward; weeks already recorded cannot be reconstructed, since the underlying timestamps were never written.
