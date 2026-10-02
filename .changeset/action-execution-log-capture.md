---
"authhero": minor
---

Add an `actionExecutionLogs` option to `init()` that controls which action (code hook) console output is saved to `action_executions.logs`. `"full"` keeps today's behaviour and is the default, `"errors"` saves output only for actions that failed or denied access, and `"off"` never saves it. Hooks still see their own console output while they run, and the execution record itself is always written; only what is stored changes. The same value can be passed to `runOutboxRelay` and `createDefaultDestinations` so outbox-delivered code hooks follow it too.
