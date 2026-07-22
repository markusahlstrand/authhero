---
"create-authhero": patch
---

Scaffold a working retention sweep into the Cloudflare templates so fresh
projects don't accumulate rows forever. The `cloudflare` and
`cloudflare-control-plane` templates now export a `scheduled` handler that calls
`runRetention` and declare a daily `[triggers] crons` block in `wrangler.toml`,
pruning expired `codes`, processed `outbox_events` and expired sessions without
the operator having to discover the data-retention guide first.

`cloudflare-wfp-tenant` deliberately gets no cron — dispatch-namespace Workers
never receive `scheduled` events — and instead documents that tenant shards are
swept centrally from the control plane. `aws-sst` records that DynamoDB's native
TTL already expires these rows, so it needs no sweep.
