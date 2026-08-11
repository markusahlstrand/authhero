---
"@authhero/adapter-interfaces": minor
"@authhero/kysely-adapter": minor
"@authhero/drizzle": minor
"@authhero/admin": minor
"authhero": minor
---

Make page hooks a persistable hook type. The `post-user-login` dispatch for page hooks already existed, but there was no way to store one: the hook schema union had no page variant and neither adapter had the columns, so a page hook could only be injected by monkeypatching `hooks.list` (as the impersonation tests did).

- `hookInsertSchema` / `hookSchema` gain a page variant with `page_id` (an enum — currently `impersonate` — so a misconfigured hook can't bounce logins to an arbitrary universal-login path) and the optional `permission_required` gate. Page hooks are restricted to the `post-user-login` trigger, the only point they can run.
- The kysely and drizzle hooks tables gain nullable `page_id` / `permission_required` columns, with additive migrations.
- The admin UI gains a "Page" hook type in the create form and details tab, listing the available pages and the permission gate, and shows `Page` in the hooks list.

This lets the impersonation page be configured as an ordinary hook — including as an `inheritable` hook on a control-plane tenant, which surfaces it on every sub-tenant — instead of being hard-coded into a deployment's `onExecutePostLogin` config hook. That matters beyond configurability: a config hook that redirects returns before the tenant's database hooks are ever read, so a hard-coded impersonation redirect silently prevented form hooks from ever running for users holding the permission.
