---
"authhero": patch
---

Fix two issues that broke the CIMD (Client ID Metadata Document) flow end-to-end on Cloudflare Workers + PlanetScale:

- **`ssrfSafeFetch` threw `TypeError` on Workers.** The helper passed `redirect: "error"` to `fetch`, which Workers rejects ("must be one of follow or manual"). Switched to `redirect: "manual"` and reject 3xx responses explicitly so the no-redirect security property is preserved. This unblocks CIMD (`client_id` as a metadata URL) and `request_uri` request objects on Workers — both surfaced as 500s on `/authorize`.
- **CIMD token issuance failed FK constraint.** `refresh_tokens.client_id` (and `login_sessions.authParams_client_id`) have a FK to `clients` (added 2025-09-16), but CIMD synthesizes the client in memory only. `getEnrichedClient` now idempotently upserts a minimal `clients` row keyed by the CIMD URL as an FK anchor on first use, marked with `client_metadata.cimd: "true"`. Runtime values still come from the freshly-fetched document each request — the stub row is only there to satisfy referential integrity.
