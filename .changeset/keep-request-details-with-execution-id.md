---
"authhero": patch
---

Keep `details.request` on tenant logs that carry an action `execution_id`. The
execution id is now passed as its own `execution_id` log param and merged into
the details object instead of replacing it, so `Successful Login` and token-grant
logs keep their request snapshot (method, path, qs, redirect_uri) when a
post-login action ran.
