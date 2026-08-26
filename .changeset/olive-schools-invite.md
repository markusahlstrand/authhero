---
"@authhero/cloudflare-adapter": patch
---

Fix `/stats/daily` returning all zeros when logs live in Analytics Engine.

The Analytics Engine stats adapter re-parsed its `from`/`to` params as
`YYYYMMDD`, but the management API already normalizes them to `YYYY-MM-DD`
before calling the adapter. Re-slicing turned `2026-07-27` into `2026--0-7-`,
so both timestamp bounds were interpolated into the SQL as `NaN` and every
query matched nothing — the dashboard rendered a zero-filled 30-day range.
Dates in either format are now accepted, and an unparseable range throws
instead of silently querying with `NaN`.

`createAdapters` also now returns a `stats` adapter whenever
`analyticsEngineLogs` is configured. `/stats/daily` and `/stats/active-users`
are log-derived like `analytics`, so consumers that move logs to Analytics
Engine were left with the SQL adapter's stats, reading a logs table that no
longer receives writes.
