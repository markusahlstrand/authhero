---
"@authhero/adapter-interfaces": patch
"authhero": patch
"@authhero/multi-tenancy": patch
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Hook metadata bag + control-plane template inheritance.

Adds a free-form `metadata: Record<string, unknown>` field to all hook variants (web, form, template, code), persisted as JSON in kysely + drizzle. Two well-known keys are defined:

- `metadata.inheritable: true` — when set on a hook on the control-plane tenant, the multi-tenancy runtime fallback surfaces that hook on every sub-tenant's `hooks.list` and `hooks.get`. Inherited hooks are read-only from the sub-tenant's perspective: writes go through the base adapter's `tenant_id` WHERE clause and are silent no-ops on cross-tenant rows.
- Template options. The dispatcher forwards `hook.metadata` to the template function. The `account-linking` template reads `metadata.copy_user_metadata: true` to merge the secondary user's `user_metadata` into the primary's on link (primary wins on key conflicts; `app_metadata` is never copied).

Includes the kysely migration `2026-04-29T10:00:00_hooks_metadata` adding the `metadata` column.
