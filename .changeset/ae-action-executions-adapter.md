---
"@authhero/cloudflare-adapter": minor
"authhero": patch
---

Add an Analytics Engine-backed `actionExecutions` adapter and decorate the post-login tenant log with the executed action's `execution_id`.

- `@authhero/cloudflare-adapter` exposes `createAnalyticsEngineActionExecutionsAdapter` and a new `analyticsEngineActionExecutions` option on `createCloudflareAdapters`, so action execution records can live in the same AE store as logs. One row per execution, blob layout documented inline; default dataset name `authhero_action_executions`.
- `authhero` now embeds `details.execution_id` on the `SUCCESS_LOGIN` log when post-login code actions ran, matching the existing token-exchange log decoration and Auth0's model of reaching executions via tenant logs. The success-login log is now emitted via a `try/finally` so it still fires on early-return / throw paths.
