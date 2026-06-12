---
"authhero": minor
---

Extend the ClientBundle cache stack (shipped in 8.0.0 for the auth-api path) to every authenticated request path — universal-login v1 + v2 and SAML — composed via a new `composeAuthData` helper so all entry points share one layer order.

- The bundle snapshot now also includes the tenant's default theme; `themes.create/update/remove` purge the bundle alongside the other tenant-scoped writes.
- Bundle-covered entities are now mostly excluded from L2 `addCaching` — the bundle is their canonical cross-request cache, so double-caching under per-entity keys would waste edge storage and create a second invalidation surface. The `BUNDLE_ENTITIES` constant lives next to the bundle implementation; each app declares only its `nonBundleEntities`. `clients` stays in L2 because `prefetchClientBundle` calls `clients.getByClientId(cid)` before `ctx.var.client_id` is set.
- The hot-path `hooks.list(tid, {q: "trigger_id:…"})` call sites in `authentication-flows/common.ts`, `hooks/user-update.ts`, and `hooks/user-registration.ts` now fetch the full tenant hooks list (bundle-covered) and filter in memory by `trigger_id`, so `hooks` moves entirely under the bundle with no L2 fallback.
- Explicit `prefetchClientBundle` helper warms the bundle at the top of every request handler that already knows (or can cheaply discover) its `client_id`. Wired into `/authorize`, `/oauth/token`, `/callback`, `/oidc/logout`, `/v2/logout`, `/co/account`, `/passwordless/start`, `/co/authenticate`, `/oauth/revoke`, the universal-login v1+v2 `initJSXRoute` helper, and two u2 ticket/invite flows. Failures are swallowed so the downstream route still handles real "client not found" with its proper error contract. Skipped for CIMD clients (URL-based client_ids that resolve out-of-band).
