---
"authhero": minor
"@authhero/multi-tenancy": patch
---

Fix `initMultiTenant` never running its protection of synced entities. It registered the guard on the app after `init()` had mounted the management routes, so Hono never ran it. Child tenants could modify or delete roles and connections synced from the control plane. Resource servers were unaffected, because they have their own check.

`init()` gains a `managementApiMiddleware` option. It runs inside the management API after authentication and tenant resolution, and before the route handlers. `initMultiTenant` now installs the guard through it. If you set up multi-tenancy by hand with `app.use("/api/v2/*", createProtectSyncedMiddleware())`, that call never ran. Pass the middleware as `init({ managementApiMiddleware: [createProtectSyncedMiddleware()] })` instead.
