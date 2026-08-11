---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"authhero": minor
"@authhero/admin": minor
---

Add session cohort retention analytics. New `GET /api/v2/analytics/session-retention` management endpoint returns weekly session cohorts (sessions created per week × share still active N weeks later), computed from the sessions table's `created_at_ts`/`used_at_ts`. Implemented as an optional `sessionRetention` method on the analytics adapter (kysely + drizzle; adapters without it get a 501). The admin analytics page gains Overview/Retention tabs with a cohort retention heatmap.
