---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"@authhero/aws-adapter": minor
"authhero": patch
---

Remove `themes.list` from the ThemesAdapter interface and its kysely/drizzle/aws implementations. Auth0 only supports a single "default" theme per tenant and nothing besides the tenant export used `list`, so the export now reads `themes.get(tenant_id, "default")` instead. This also fixes tenant export failing with `themes.list is not a function` against deployments that override the themes adapter with a partial implementation (e.g. a vendor-settings-backed one that only implements `get`/`create`/`update`/`remove`).
