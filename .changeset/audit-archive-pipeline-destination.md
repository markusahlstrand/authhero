---
"authhero": minor
---

Add a `pipeline` outbox destination that archives audit events to a Cloudflare Pipelines stream (landing them in R2 as an Iceberg table). Configure with `init({ outbox: { pipeline: { endpoint, token } } })`, or pass `pipeline` to `createDefaultDestinations` for the cron drain path. No destination is registered when the config is absent, so existing deployments are unaffected.
