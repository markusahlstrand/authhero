---
"@authhero/adapter-interfaces": minor
"authhero": minor
"@authhero/drizzle": minor
"@authhero/kysely-adapter": minor
---

Add weekly refresh-token cohort retention analytics with optional client filtering

New `GET /api/v2/analytics/refresh-token-retention` management endpoint (weeks 1-26, repeatable `client_id` filter), backed by an optional `refreshTokenRetention` method on the analytics adapter. Rotating refresh tokens are folded into rotation families before the cohort fold, so each unit represents a device/app that got a refresh token rather than each rotation. Implemented for the drizzle and kysely adapters.
