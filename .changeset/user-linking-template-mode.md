---
"@authhero/adapter-interfaces": patch
"authhero": patch
"@authhero/kysely-adapter": patch
"@authhero/drizzle": patch
---

Make user linking opt-in via the `account-linking` template hook.

The legacy `linkUsersHook` has been renamed to `commitUserHook` and the email-based primary-user lookup is now an explicit option (`resolveEmailLinkedPrimary`). Whether it runs is controlled by:

- A new service-level `userLinkingMode` option on `init()` — `"builtin"` (default, current behaviour) or `"off"` (template only). The template hook is controlled independently via the management API regardless of mode.
- A per-client `user_linking_mode` field on the `Client` schema that overrides the service-level default for a single application — useful for validating the template-driven path on one client before flipping the whole tenant.

The `account-linking` template hook is now a registered template (`template_id: "account-linking"`) and supports three triggers: `post-user-login` (existing), `post-user-registration`, and `post-user-update`. Tenants enable it via the management API:

```json
{ "trigger_id": "post-user-registration", "template_id": "account-linking", "enabled": true }
```

`hookTemplates[<id>].trigger_id` (singular) is now `trigger_ids` (array) to support multi-trigger templates.

Adds a free-form `metadata: Record<string, unknown>` field to all hook variants (web, form, template, code). Two well-known keys:

- `inheritable: true` — reserved for the multi-tenancy sync (Phase 2) so the control plane can mark which hooks should surface to sub-tenants. The runtime ignores it for now.
- Template options. The `account-linking` template reads `copy_user_metadata: true` to merge the secondary user's `user_metadata` into the primary's on link (primary wins on key conflicts; `app_metadata` is never copied).

Includes the kysely migration `2026-04-28T10:00:00_client_user_linking_mode` (per-client user_linking_mode) and `2026-04-29T10:00:00_hooks_metadata` (hooks metadata column), and the equivalent drizzle schema columns.
