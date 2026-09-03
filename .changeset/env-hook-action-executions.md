---
"authhero": patch
---

Record an action execution for `ctx.env.hooks.onExecutePostLogin`. Env post-login
hooks previously produced no `action_executions` row and no `details.execution_id`
on the `Successful Login` log, because the env-hook branch returned before the
code-hook persist. Env and code hook outcomes are now aggregated into one
execution record, persisted on every exit path — including an env hook that
redirects or throws.
