---
"authhero": minor
"@authhero/cloudflare-adapter": minor
---

Add structured observability metrics to the outbox relay. Both the inline
per-request relay and the cron drain can now emit
`outbox_events_processed_total`, `outbox_events_dead_lettered_total` and
`outbox_retry_delay_seconds` to an optional sink configured via
`init({ outbox: { metrics } })` and `runOutboxRelay({ metrics })`. The core
package stays sink-agnostic; `@authhero/cloudflare-adapter` ships an Analytics
Engine implementation as `createAnalyticsEngineOutboxMetricsSink`.
