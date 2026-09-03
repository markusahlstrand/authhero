---
"authhero": patch
---

Bound the console output persisted with each action execution, matching Auth0's documented limits.

`persistActionExecution` now caps the aggregated `logs` payload at 256 characters per execution — a budget for the whole execution rather than a per-line trim — and appends an explicit `[authhero] console output truncated at 256 characters …` marker so a truncated record is never mistaken for a complete one.

The default `actionExecutionsRetentionDays` drops from 30 to 10 days, matching Auth0's execution-storage window. Deployments that want the old window can pass `actionExecutionsRetentionDays: 30` to `runRetention`.
