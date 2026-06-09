---
"@authhero/cloudflare-adapter": minor
"@authhero/kysely-adapter": patch
---

Make the database authoritative for custom-domain reads. The Cloudflare wrapper's `list()` now reads straight from the DB instead of fanning out a per-row Cloudflare API call — removing the silent-drop hazard that emptied the admin UI whenever a single Cloudflare GET failed (404, schema mismatch, rate-limit). `create()` and `uploadCertificate()` now mirror the mapped Cloudflare-derived state (`status`, `verification`) back to the DB so list/get can render without depending on Cloudflare being reachable. The kysely `list()` adapter now parses the stored `verification` JSON.
