---
"authhero": patch
---

Internal: migrate all route modules to `@hono/zod-openapi` v1.x's `defineRoute`/`openapiRoutes` pattern, collapse the u2 universal-login routes onto a single enum-validated dispatcher, and swap dts bundling from `dts-bundle-generator` to `rollup-plugin-dts`.

**Route pattern migration.** Each route file's chained `new OpenAPIHono<...>().openapi(...).openapi(...)` is now a list of named `defineRoute({ route, handler })` constants registered via `.openapiRoutes([...] as const)`. The exported schema type is the same — `testClient` typed RPC works unchanged — but the underlying type shape is a flat path→method map instead of a deeply nested intersection, which cuts TypeScript's recursive instantiation cost dramatically.

**u2 universal-login dispatcher.** The 58 per-screen route declarations in `src/routes/universal-login/u2-routes.tsx` have been collapsed into two catch-all dispatcher routes (`GET|POST /:screen{.+}`). The screen path is validated by Zod against `SCREEN_GET_PATHS` / `SCREEN_POST_PATHS` enums and dispatched to the existing screen handlers. External URLs are unchanged.

Two consumer-visible changes follow from this:
- Unknown screen paths now return **HTTP 400** (Zod enum mismatch) instead of 404. Clients that distinguished "screen does not exist" from other 4xxs via the status code should update.
- The per-screen typed RPC (`u2Client.login.identifier.$get(...)`) is gone — there are no longer per-screen route types to derive it from. Tests must switch to the new `u2Screen(u2App, env, "login/identifier").$get(...)` helper in `test/helpers/u2-screen.ts`.

**Build pipeline.** `dts-bundle-generator` is replaced with a two-stage pipeline: `tsc -p tsconfig.types.json` emits per-file `.d.ts` files to `dist/types/`, then `rollup -c rollup.dts.config.mjs` bundles them via `rollup-plugin-dts`. External dependencies (zod, hono, etc.) remain as `import` statements in the emitted bundle rather than being inlined.

Cold `authhero` build drops from ~85 s / 4.4 GB peak to ~21 s / 1.74 GB. The `NODE_OPTIONS=--max-old-space-size=8192` workaround is no longer needed and has been removed.
