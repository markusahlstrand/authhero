---
"@authhero/adapter-interfaces": minor
"@authhero/cloudflare-adapter": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"authhero": minor
"@authhero/react-admin": patch
---

Add `from_date` / `to_date` (Unix seconds) query params to the `GET /api/v2/logs` endpoint and propagate them through the kysely, drizzle, and Cloudflare Analytics Engine adapters. The admin UI now exposes these as filter inputs and reads `length` as the total count, fixing pagination beyond the first page when the backend reports `length` instead of `total`.
