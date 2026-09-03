---
"authhero": patch
---

Bound the console output persisted with each action execution.

`persistActionExecution` now caps the aggregated `logs` payload at 256 characters per execution — a budget spent across lines in order rather than a per-line trim — and appends an explicit `[authhero] console output truncated at 256 characters …` marker so a truncated record is never mistaken for a complete one. Auth0 uses the same number but charges it per Action, so an execution with several bound actions is stricter here than on Auth0.

The default `actionExecutionsRetentionDays` drops from 30 to 10 days, matching Auth0's execution-storage window. Deployments that want the old window can pass `actionExecutionsRetentionDays: 30` to `runRetention`.
