# @authhero/cloudflare-adapter

## 2.30.1

### Patch Changes

- Updated dependencies [1bcf864]
  - @authhero/adapter-interfaces@2.5.0
  - @authhero/kysely-adapter@11.2.2

## 2.30.0

### Minor Changes

- 30233a7: Add an Analytics Engine-backed `actionExecutions` adapter and decorate the post-login tenant log with the executed action's `execution_id`.
  - `@authhero/cloudflare-adapter` exposes `createAnalyticsEngineActionExecutionsAdapter` and a new `analyticsEngineActionExecutions` option on `createCloudflareAdapters`, so action execution records can live in the same AE store as logs. One row per execution, blob layout documented inline; default dataset name `authhero_action_executions`.
  - `authhero` now embeds `details.execution_id` on the `SUCCESS_LOGIN` log when post-login code actions ran, matching the existing token-exchange log decoration and Auth0's model of reaching executions via tenant logs. The success-login log is now emitted via a `try/finally` so it still fires on early-return / throw paths.

## 2.29.1

### Patch Changes

- b6e628b: Fix 500 on `/api/v2/analytics/active-users` against Cloudflare Analytics Engine. AE SQL doesn't support `uniqExact`; switched to `COUNT(DISTINCT blob7)`.
- Updated dependencies [b6e628b]
  - @authhero/adapter-interfaces@2.4.0
  - @authhero/kysely-adapter@11.2.1

## 2.29.0

### Minor Changes

- 3b086bc: Add `from_date` / `to_date` (Unix seconds) query params to the `GET /api/v2/logs` endpoint and propagate them through the kysely, drizzle, and Cloudflare Analytics Engine adapters. The admin UI now exposes these as filter inputs and reads `length` as the total count, fixing pagination beyond the first page when the backend reports `length` instead of `total`.

### Patch Changes

- 3b086bc: Fix analytics queries failing with `toStartOfDay() function does not accept 2 arguments`. Cloudflare Analytics Engine's `toStartOf*` functions don't accept a timezone argument; the timezone is now applied via `toDateTime(..., tz)` instead.
- Updated dependencies [3b086bc]
  - @authhero/adapter-interfaces@2.3.0
  - @authhero/kysely-adapter@11.2.0

## 2.28.2

### Patch Changes

- Updated dependencies [5e35511]
- Updated dependencies [5e35511]
  - @authhero/adapter-interfaces@2.2.0
  - @authhero/kysely-adapter@11.1.2

## 2.28.1

### Patch Changes

- e529742: Fix `/analytics/*` endpoints returning `Internal Server Error`.
  - `@authhero/cloudflare-adapter`: `createAdapters` now also creates an `analytics` adapter (backed by the Analytics Engine SQL API) when `analyticsEngineLogs` is configured. Previously only `logs` was wired, so consumers that spread the kysely adapter were silently falling through to the kysely analytics path.
  - `@authhero/kysely-adapter`: the analytics time-bucketing SQL used SQLite-only functions (`datetime`, `strftime`) which MySQL/PlanetScale rejected with a 1064 syntax error. The adapter now detects the dialect at runtime and emits portable expressions for UTC, plus MySQL-specific expressions for non-UTC timezones.

- Updated dependencies [e529742]
  - @authhero/kysely-adapter@11.1.1

## 2.28.0

### Minor Changes

- e9bef63: Add `/api/v2/analytics/*` — richer stats endpoints with filtering, breakdowns, and a ClickHouse-style `{ meta, data }` wire format.

  **Five resources** under `/api/v2/analytics/`: `active-users`, `logins`, `signups`, `refresh-tokens`, `sessions`. Each accepts the same shared parameter shape — `from`, `to`, `interval`, `tz`, repeatable `connection`/`client_id`/`user_type`/`user_id` filters, comma-separated `group_by`, plus `limit`/`offset`/`order_by`. Per-resource grouping rules are validated server-side and rejections return a problem+json body with the offending `param`.

  **Wire format** is `{ meta, data, rows, rows_before_limit_at_least, statistics }`, identical to Cloudflare Analytics Engine's SQL output, so the response can be passed straight into Recharts, Tremor, ECharts, Observable Plot, or any ClickHouse-speaking BI tool with zero adapter code.

  **New `AnalyticsAdapter`** in `@authhero/adapter-interfaces`. Implementations:
  - `@authhero/cloudflare-adapter` — `createAnalyticsEngineAnalyticsAdapter`, compiles each query to a single parameterized SQL statement against the Analytics Engine dataset; tenant predicate is injected server-side and never trusted from request input.
  - `@authhero/kysely-adapter` and `@authhero/drizzle` — SQL fallbacks against the `logs` table for local dev and tests (`day` / `hour` / `month` intervals; week is rejected). Active-users uses `COUNT(DISTINCT user_id)`.

  **Response caching** uses the existing `CacheAdapter` (Cloudflare cache in workers, in-memory locally — no new KV needed). TTL is picked based on how recent the `to` boundary is: 60s for the live window, 5m for last 24h, 1h within yesterday, 24h for older windows. Cache keys are namespaced by `tenant_id` and normalize the query string so semantically-equivalent requests share an entry.

  **Guard rails**: `limit` capped at 10000; `interval=hour` rejected for ranges over 30 days; ungrouped queries can't request more than ~50k rows.

  **New scope**: `read:analytics` (alongside `auth:read`).

  **React-admin**: new `/analytics` page with resource picker, time-range presets, group-by toggles, connection/client filters, line + bar charts, and CSV export.

### Patch Changes

- 52aba15: Tighten `/api/v2/stats/daily` and `/api/v2/stats/active-users` to match Auth0's semantics.

  **`logins` no longer over-counts.** All three stats adapters (kysely, drizzle, cloudflare/analytics-engine) now count only `s` (SUCCESS_LOGIN) as a login. Previously they also summed token exchanges (`seacft`, `seccft`, `sepft`, `sertft`) and silent auth (`ssa`), which inflated the figure substantially for SPAs that refresh tokens frequently. Auth0's daily-stats `logins` is just successful logins, so the numbers now line up.

  **`leaked_passwords` matches Auth0's definition.** Adapters now sum only `pwd_leak` (breached-password detection). The authhero-internal `signup_pwd_leak` and `reset_pwd_leak` variants are no longer included in this metric.

  **`/stats/active-users` only counts real logins.** Same narrowing — distinct users with a `SUCCESS_LOGIN` in the last 30 days, not distinct users who happened to exchange a refresh token.

  **Zero-fill in `/stats/daily`.** The route now returns one row per day in the requested range, including days with no events (Auth0 behavior). Previously consumers got gaps for empty days, breaking graphs that iterate the array sequentially.

- Updated dependencies [e9bef63]
- Updated dependencies [7c8668d]
- Updated dependencies [52aba15]
  - @authhero/adapter-interfaces@2.1.0
  - @authhero/kysely-adapter@11.1.0

## 2.27.1

### Patch Changes

- Updated dependencies [63bf3a9]
- Updated dependencies [63bf3a9]
- Updated dependencies [63bf3a9]
  - @authhero/adapter-interfaces@2.0.0
  - @authhero/kysely-adapter@11.0.0

## 2.27.0

### Minor Changes

- 0539c2a: Move the Worker Loader code executor into `@authhero/cloudflare-adapter` and rename both Cloudflare code executors so the naming reflects which Cloudflare primitive each one uses.
  - New: `WorkerLoaderCodeExecutor` in `@authhero/cloudflare-adapter` — uses the Worker Loader binding to create isolates on the fly from in-memory code. Previously exported as `CloudflareCodeExecutor` from `authhero`.
  - Renamed: `CloudflareCodeExecutor` → `DispatchNamespaceCodeExecutor` in `@authhero/cloudflare-adapter` — uses a Workers for Platforms dispatch namespace and requires user code to be pre-deployed as worker scripts.
  - Deprecated alias: `CloudflareCodeExecutor` / `CloudflareCodeExecutorConfig` remain exported from `@authhero/cloudflare-adapter` as aliases of the dispatch-namespace executor, to be removed in the next major.
  - `authhero` no longer re-exports `CloudflareCodeExecutor`. Import the executor from `@authhero/cloudflare-adapter` instead. `LocalCodeExecutor` continues to be exported from `authhero` since it is platform-agnostic.

  Migration:

  ```ts
  // Before
  import { CloudflareCodeExecutor } from "authhero";
  const exec = new CloudflareCodeExecutor({ loader: env.LOADER });

  // After
  import { WorkerLoaderCodeExecutor } from "@authhero/cloudflare-adapter";
  const exec = new WorkerLoaderCodeExecutor({ loader: env.LOADER });
  ```

  In the same change, `globalOutbound: null` is removed from the Worker Loader executor's `WorkerCode`, so user actions can now make outbound `fetch()` calls (Slack webhooks, email APIs, etc.). The Worker Loader still provides v8-level isolation from the parent worker's bindings — this only widens the network boundary, not the host boundary. Previously, any `fetch()` from action code failed with _"This worker is not permitted to access the internet via global functions like fetch()"_.

## 2.26.7

### Patch Changes

- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
- Updated dependencies [1ea694f]
  - @authhero/kysely-adapter@10.136.0
  - @authhero/adapter-interfaces@1.19.0

## 2.26.6

### Patch Changes

- Updated dependencies [2ea1664]
- Updated dependencies [2ea1664]
  - @authhero/adapter-interfaces@1.18.0
  - @authhero/kysely-adapter@10.135.0

## 2.26.5

### Patch Changes

- Updated dependencies [0c662c0]
  - @authhero/adapter-interfaces@1.17.0
  - @authhero/kysely-adapter@10.134.0

## 2.26.4

### Patch Changes

- Updated dependencies [7dd280c]
- Updated dependencies [7dd280c]
- Updated dependencies [7dd280c]
- Updated dependencies [45f719e]
  - @authhero/adapter-interfaces@1.16.0
  - @authhero/kysely-adapter@10.133.0

## 2.26.3

### Patch Changes

- Updated dependencies [639ab29]
  - @authhero/adapter-interfaces@1.15.0
  - @authhero/kysely-adapter@10.132.4

## 2.26.2

### Patch Changes

- Updated dependencies [85d1d06]
  - @authhero/adapter-interfaces@1.14.0
  - @authhero/kysely-adapter@10.132.3

## 2.26.1

### Patch Changes

- Updated dependencies [e0cd449]
- Updated dependencies [86fe6e8]
- Updated dependencies [f41b85c]
- Updated dependencies [3891832]
  - @authhero/adapter-interfaces@1.13.0
  - @authhero/kysely-adapter@10.132.2

## 2.26.0

### Minor Changes

- a4e29bd: Add a `RateLimitAdapter` interface and an opt-in Cloudflare implementation
  backed by the Workers Rate Limiter binding. The cloudflare adapter accepts
  `rateLimitBindings` (per-scope: `pre-login`, `pre-user-registration`,
  `brute-force`) and returns a `rateLimit` adapter when at least one binding
  is configured. Missing bindings or thrown errors fail open so a misconfigured
  deploy never locks users out.

  The password grant now consults `data.rateLimit?.consume("pre-login", ...)`
  keyed by `${tenantId}:${ip}` when the tenant has
  `suspicious_ip_throttling.enabled` and the IP is not in the allowlist. The
  Workers Rate Limiter only supports 10s/60s windows, so the configured
  `max_attempts` is intentionally not honored — see the Durable Object
  follow-up note in `packages/cloudflare/src/rate-limit/index.ts` for the
  plan to support tenant-tunable thresholds.

### Patch Changes

- Updated dependencies [32aacc6]
- Updated dependencies [a4e29bd]
- Updated dependencies [32aacc6]
- Updated dependencies [6e5762c]
- Updated dependencies [32aacc6]
  - @authhero/adapter-interfaces@1.12.0
  - @authhero/kysely-adapter@10.132.1

## 2.25.9

### Patch Changes

- Updated dependencies [21b0608]
- Updated dependencies [ea5ec43]
- Updated dependencies [90e9906]
  - @authhero/adapter-interfaces@1.11.0
  - @authhero/kysely-adapter@10.132.0

## 2.25.8

### Patch Changes

- Updated dependencies [e5cbfe7]
- Updated dependencies [dd071e0]
  - @authhero/adapter-interfaces@1.10.3
  - @authhero/kysely-adapter@10.131.5

## 2.25.7

### Patch Changes

- Updated dependencies [3230b9b]
- Updated dependencies [e8e7411]
  - @authhero/adapter-interfaces@1.10.2
  - @authhero/kysely-adapter@10.131.4

## 2.25.6

### Patch Changes

- Updated dependencies [4d06f0d]
  - @authhero/adapter-interfaces@1.10.1
  - @authhero/kysely-adapter@10.131.3

## 2.25.5

### Patch Changes

- Updated dependencies [ba03e14]
  - @authhero/adapter-interfaces@1.10.0
  - @authhero/kysely-adapter@10.131.2

## 2.25.4

### Patch Changes

- Updated dependencies [2578652]
  - @authhero/adapter-interfaces@1.9.0
  - @authhero/kysely-adapter@10.131.1

## 2.25.3

### Patch Changes

- ee8f683: Harden `CloudflareCache.get` against empty or malformed cache bodies. Cloudflare's Cache API can occasionally return a matched entry with an empty body (edge races, evictions mid-stream), which caused `response.json()` to throw `SyntaxError: Unexpected end of JSON input`. The adapter now reads the body as text, treats empty or unparseable bodies as a cache miss, and evicts the bad entry so the next read refills it.
- Updated dependencies [48eab09]
- Updated dependencies [ee8f683]
- Updated dependencies [02cebf4]
  - @authhero/adapter-interfaces@1.8.0
  - @authhero/kysely-adapter@10.131.0

## 2.25.2

### Patch Changes

- Updated dependencies [9145dbd]
- Updated dependencies [9145dbd]
  - @authhero/adapter-interfaces@1.7.0
  - @authhero/kysely-adapter@10.130.0

## 2.25.1

### Patch Changes

- Updated dependencies [7d9f138]
  - @authhero/adapter-interfaces@1.6.0
  - @authhero/kysely-adapter@10.129.0

## 2.25.0

### Minor Changes

- b4f4f15: Fix the logs endpoint

### Patch Changes

- Updated dependencies [0b3419b]
  - @authhero/kysely-adapter@10.128.1

## 2.24.4

### Patch Changes

- Updated dependencies [f27884d]
- Updated dependencies [31b0b62]
  - @authhero/kysely-adapter@10.128.0

## 2.24.3

### Patch Changes

- Updated dependencies [a833d42]
  - @authhero/kysely-adapter@10.127.1

## 2.24.2

### Patch Changes

- Updated dependencies [931f598]
  - @authhero/adapter-interfaces@1.5.0
  - @authhero/kysely-adapter@10.127.0

## 2.24.1

### Patch Changes

- 6503423: Fix and extend log filtering on the admin logs page.
  - The `IP Address` filter on the logs list was sent as `?ip=<value>`, but the management API only accepts filters through the Lucene `q` parameter, so the filter was silently dropped. Non-`q` filter fields are now merged into `q` as `key:value` pairs (e.g. `q=ip:89.10.186.153`).
  - Added `Type` and `Status` (success/failure) select filters to the logs list.
  - The Cloudflare Analytics Engine adapter now understands the pseudo-filter `success:true|false` and translates it to a `blob3 LIKE 's%' | 'f%'` prefix match on the log type.

- Updated dependencies [6503423]
  - @authhero/kysely-adapter@10.126.1

## 2.24.0

### Minor Changes

- b5f73bb: Add drain outbox

### Patch Changes

- Updated dependencies [1d15292]
- Updated dependencies [b5f73bb]
  - @authhero/adapter-interfaces@1.4.1
  - @authhero/kysely-adapter@10.126.0

## 2.23.0

### Minor Changes

- d288b62: Add support for dynamic workers

### Patch Changes

- Updated dependencies [d288b62]
  - @authhero/kysely-adapter@10.125.0

## 2.22.4

### Patch Changes

- Updated dependencies [d84cb2f]
  - @authhero/adapter-interfaces@1.4.0
  - @authhero/kysely-adapter@10.124.0

## 2.22.3

### Patch Changes

- Updated dependencies [2f6354d]
  - @authhero/adapter-interfaces@1.3.0
  - @authhero/kysely-adapter@10.123.0

## 2.22.2

### Patch Changes

- Updated dependencies [b2aff48]
  - @authhero/adapter-interfaces@1.2.0
  - @authhero/kysely-adapter@10.122.0

## 2.22.1

### Patch Changes

- Updated dependencies [3da602c]
  - @authhero/adapter-interfaces@1.1.0
  - @authhero/kysely-adapter@10.121.1

## 2.22.0

### Minor Changes

- 20d5140: Add support for dynamic code

  BREAKING CHANGE: `DataAdapters` now requires a `hookCode: HookCodeAdapter` property. Adapters implementing `DataAdapters` must provide a `hookCode` adapter with `create`, `get`, `update`, and `remove` methods for managing hook code storage. See `packages/kysely/src/hook-code/` for a reference implementation.

### Patch Changes

- Updated dependencies [20d5140]
  - @authhero/adapter-interfaces@1.0.0
  - @authhero/kysely-adapter@10.121.0

## 2.21.19

### Patch Changes

- Updated dependencies [a59a49b]
  - @authhero/adapter-interfaces@0.155.0
  - @authhero/kysely-adapter@10.120.0

## 2.21.18

### Patch Changes

- Updated dependencies [fa7ce07]
  - @authhero/adapter-interfaces@0.154.0
  - @authhero/kysely-adapter@10.119.0

## 2.21.17

### Patch Changes

- Updated dependencies [77b7c76]
  - @authhero/kysely-adapter@10.118.0

## 2.21.16

### Patch Changes

- Updated dependencies [884e950]
- Updated dependencies [884e950]
  - @authhero/kysely-adapter@10.117.0
  - @authhero/adapter-interfaces@0.153.0

## 2.21.15

### Patch Changes

- Updated dependencies [2f65572]
- Updated dependencies [76f2b7f]
  - @authhero/kysely-adapter@10.116.0

## 2.21.14

### Patch Changes

- Updated dependencies [f3b910c]
  - @authhero/adapter-interfaces@0.152.0
  - @authhero/kysely-adapter@10.115.0

## 2.21.13

### Patch Changes

- Updated dependencies [3e74dea]
- Updated dependencies [022f12f]
  - @authhero/adapter-interfaces@0.151.0
  - @authhero/kysely-adapter@10.114.0

## 2.21.12

### Patch Changes

- Updated dependencies [164fe2c]
  - @authhero/adapter-interfaces@0.150.0
  - @authhero/kysely-adapter@10.113.0

## 2.21.11

### Patch Changes

- Updated dependencies [b3ad21f]
  - @authhero/kysely-adapter@10.112.0

## 2.21.10

### Patch Changes

- Updated dependencies [c862e9f]
  - @authhero/kysely-adapter@10.111.0

## 2.21.9

### Patch Changes

- Updated dependencies [f4557c1]
  - @authhero/kysely-adapter@10.110.0

## 2.21.8

### Patch Changes

- Updated dependencies [d9c2ad1]
  - @authhero/kysely-adapter@10.109.0

## 2.21.7

### Patch Changes

- Updated dependencies [64e858a]
  - @authhero/adapter-interfaces@0.149.0
  - @authhero/kysely-adapter@10.108.0

## 2.21.6

### Patch Changes

- Updated dependencies [469c395]
  - @authhero/adapter-interfaces@0.148.0
  - @authhero/kysely-adapter@10.107.1

## 2.21.5

### Patch Changes

- Updated dependencies [5e73f56]
- Updated dependencies [5e73f56]
  - @authhero/adapter-interfaces@0.147.0
  - @authhero/kysely-adapter@10.107.0

## 2.21.4

### Patch Changes

- Updated dependencies [318fcf9]
- Updated dependencies [318fcf9]
  - @authhero/adapter-interfaces@0.146.0
  - @authhero/kysely-adapter@10.106.2

## 2.21.3

### Patch Changes

- Updated dependencies [30b5be1]
  - @authhero/adapter-interfaces@0.145.0
  - @authhero/kysely-adapter@10.106.1

## 2.21.2

### Patch Changes

- Updated dependencies [dcbd1d7]
  - @authhero/adapter-interfaces@0.144.0
  - @authhero/kysely-adapter@10.106.0

## 2.21.1

### Patch Changes

- Updated dependencies [39df1aa]
  - @authhero/adapter-interfaces@0.143.0
  - @authhero/kysely-adapter@10.105.1

## 2.21.0

### Minor Changes

- 1a72b93: Added error pages and fixed provider user id

### Patch Changes

- Updated dependencies [1a72b93]
  - @authhero/adapter-interfaces@0.142.0
  - @authhero/kysely-adapter@10.105.0

## 2.20.0

### Minor Changes

- 3de697d: Add support for http validation of domains

### Patch Changes

- Updated dependencies [c65565c]
- Updated dependencies [3de697d]
  - @authhero/kysely-adapter@10.104.0
  - @authhero/adapter-interfaces@0.141.0

## 2.19.3

### Patch Changes

- Updated dependencies [c7c8770]
- Updated dependencies [38d5be2]
  - @authhero/kysely-adapter@10.103.0

## 2.19.2

### Patch Changes

- Updated dependencies [7154fe1]
  - @authhero/adapter-interfaces@0.140.0
  - @authhero/kysely-adapter@10.102.0

## 2.19.1

### Patch Changes

- Updated dependencies [2617efb]
  - @authhero/adapter-interfaces@0.139.0
  - @authhero/kysely-adapter@10.101.1

## 2.19.0

### Minor Changes

- 35691f6: Set custom domain metadata

### Patch Changes

- Updated dependencies [35691f6]
  - @authhero/kysely-adapter@10.101.0

## 2.18.16

### Patch Changes

- Updated dependencies [192f480]
  - @authhero/adapter-interfaces@0.138.0
  - @authhero/kysely-adapter@10.100.0

## 2.18.15

### Patch Changes

- Updated dependencies [6476145]
  - @authhero/kysely-adapter@10.99.0

## 2.18.14

### Patch Changes

- Updated dependencies [0719de4]
  - @authhero/adapter-interfaces@0.137.0
  - @authhero/kysely-adapter@10.98.0

## 2.18.13

### Patch Changes

- Updated dependencies [d7bcd19]
  - @authhero/adapter-interfaces@0.136.0
  - @authhero/kysely-adapter@10.97.0

## 2.18.12

### Patch Changes

- Updated dependencies [65321b7]
  - @authhero/adapter-interfaces@0.135.0
  - @authhero/kysely-adapter@10.96.1

## 2.18.11

### Patch Changes

- Updated dependencies [a5c1ba9]
  - @authhero/adapter-interfaces@0.134.0
  - @authhero/kysely-adapter@10.96.0

## 2.18.10

### Patch Changes

- Updated dependencies [7adc7dc]
  - @authhero/adapter-interfaces@0.133.0
  - @authhero/kysely-adapter@10.95.1

## 2.18.9

### Patch Changes

- Updated dependencies [cd5fdc4]
  - @authhero/kysely-adapter@10.95.0

## 2.18.8

### Patch Changes

- Updated dependencies [131ea43]
  - @authhero/adapter-interfaces@0.132.0
  - @authhero/kysely-adapter@10.94.1

## 2.18.7

### Patch Changes

- Updated dependencies [c5935bd]
  - @authhero/adapter-interfaces@0.131.0
  - @authhero/kysely-adapter@10.94.0

## 2.18.6

### Patch Changes

- Updated dependencies [ac8af37]
  - @authhero/adapter-interfaces@0.130.0
  - @authhero/kysely-adapter@10.93.0

## 2.18.5

### Patch Changes

- Updated dependencies [3b4445f]
  - @authhero/kysely-adapter@10.92.0

## 2.18.4

### Patch Changes

- Updated dependencies [a8e70e6]
  - @authhero/adapter-interfaces@0.129.0
  - @authhero/kysely-adapter@10.91.0

## 2.18.3

### Patch Changes

- Updated dependencies [e7f5ce5]
  - @authhero/kysely-adapter@10.90.0

## 2.18.2

### Patch Changes

- Updated dependencies [6585906]
  - @authhero/adapter-interfaces@0.128.0
  - @authhero/kysely-adapter@10.89.0

## 2.18.1

### Patch Changes

- Updated dependencies [fd374a9]
- Updated dependencies [8150432]
  - @authhero/adapter-interfaces@0.127.0
  - @authhero/kysely-adapter@10.88.0

## 2.18.0

### Minor Changes

- 154993d: Improve react-admin experience by clearing caches and setting cores

### Patch Changes

- Updated dependencies [154993d]
  - @authhero/adapter-interfaces@0.126.0
  - @authhero/kysely-adapter@10.87.1

## 2.17.24

### Patch Changes

- Updated dependencies [491842a]
  - @authhero/adapter-interfaces@0.125.0
  - @authhero/kysely-adapter@10.87.0

## 2.17.23

### Patch Changes

- Updated dependencies [2af900c]
- Updated dependencies [2be02f8]
- Updated dependencies [2af900c]
  - @authhero/adapter-interfaces@0.124.0
  - @authhero/kysely-adapter@10.86.0

## 2.17.22

### Patch Changes

- Updated dependencies [2d0a7f4]
  - @authhero/adapter-interfaces@0.123.0
  - @authhero/kysely-adapter@10.85.0

## 2.17.21

### Patch Changes

- Updated dependencies [49039c0]
  - @authhero/kysely-adapter@10.84.0

## 2.17.20

### Patch Changes

- Updated dependencies [76510cd]
  - @authhero/kysely-adapter@10.83.0

## 2.17.19

### Patch Changes

- Updated dependencies [846a92c]
  - @authhero/kysely-adapter@10.82.0

## 2.17.18

### Patch Changes

- Updated dependencies [168b585]
  - @authhero/kysely-adapter@10.81.0

## 2.17.17

### Patch Changes

- Updated dependencies [9d6cfb8]
  - @authhero/adapter-interfaces@0.122.0
  - @authhero/kysely-adapter@10.80.1

## 2.17.16

### Patch Changes

- Updated dependencies [2853db0]
- Updated dependencies [967d470]
  - @authhero/adapter-interfaces@0.121.0
  - @authhero/kysely-adapter@10.80.0

## 2.17.15

### Patch Changes

- Updated dependencies [00d2f83]
  - @authhero/adapter-interfaces@0.120.0
  - @authhero/kysely-adapter@10.79.0

## 2.17.14

### Patch Changes

- Updated dependencies [8ab8c0b]
  - @authhero/adapter-interfaces@0.119.0
  - @authhero/kysely-adapter@10.78.0

## 2.17.13

### Patch Changes

- Updated dependencies [3d3fcc0]
  - @authhero/kysely-adapter@10.77.0

## 2.17.12

### Patch Changes

- Updated dependencies [b7bb663]
  - @authhero/adapter-interfaces@0.118.0
  - @authhero/kysely-adapter@10.76.2

## 2.17.11

### Patch Changes

- Updated dependencies [8611a98]
  - @authhero/adapter-interfaces@0.117.0
  - @authhero/kysely-adapter@10.76.1

## 2.17.10

### Patch Changes

- Updated dependencies [9c15354]
  - @authhero/adapter-interfaces@0.116.0
  - @authhero/kysely-adapter@10.76.0

## 2.17.9

### Patch Changes

- Updated dependencies [f738edf]
  - @authhero/adapter-interfaces@0.115.0
  - @authhero/kysely-adapter@10.75.0

## 2.17.8

### Patch Changes

- Updated dependencies [17d73eb]
- Updated dependencies [e542773]
  - @authhero/adapter-interfaces@0.114.0
  - @authhero/kysely-adapter@10.74.0

## 2.17.7

### Patch Changes

- Updated dependencies [d967833]
  - @authhero/adapter-interfaces@0.113.0
  - @authhero/kysely-adapter@10.73.1

## 2.17.6

### Patch Changes

- Updated dependencies [0f8e4e8]
- Updated dependencies [3a180df]
  - @authhero/kysely-adapter@10.73.0

## 2.17.5

### Patch Changes

- Updated dependencies [1c36752]
  - @authhero/kysely-adapter@10.72.0

## 2.17.4

### Patch Changes

- Updated dependencies [ae8553a]
  - @authhero/adapter-interfaces@0.112.0
  - @authhero/kysely-adapter@10.71.0

## 2.17.3

### Patch Changes

- Updated dependencies [100b1bd]
  - @authhero/kysely-adapter@10.70.0

## 2.17.2

### Patch Changes

- Updated dependencies [02567cd]
- Updated dependencies [906337d]
  - @authhero/kysely-adapter@10.69.0
  - @authhero/adapter-interfaces@0.111.0

## 2.17.1

### Patch Changes

- Updated dependencies [a108525]
  - @authhero/adapter-interfaces@0.110.0
  - @authhero/kysely-adapter@10.68.0

## 2.17.0

### Minor Changes

- 1bec131: Add stats endpoints and activity view

### Patch Changes

- Updated dependencies [1bec131]
  - @authhero/adapter-interfaces@0.109.0
  - @authhero/kysely-adapter@10.67.0

## 2.16.0

### Minor Changes

- ee4584d: Small update for getting local mode working smoothly

### Patch Changes

- Updated dependencies [ee4584d]
  - @authhero/kysely-adapter@10.66.0

## 2.15.0

### Minor Changes

- 5c34a61: Add support for analytics engine
- 0e906aa: Generalize the base adapter

### Patch Changes

- Updated dependencies [0e906aa]
  - @authhero/adapter-interfaces@0.108.0
  - @authhero/kysely-adapter@10.65.2

## 2.14.4

### Patch Changes

- Updated dependencies [212f5c6]
  - @authhero/adapter-interfaces@0.107.0
  - @authhero/kysely-adapter@10.65.1

## 2.14.3

### Patch Changes

- Updated dependencies [f37644f]
  - @authhero/adapter-interfaces@0.106.0
  - @authhero/kysely-adapter@10.64.1

## 2.14.2

### Patch Changes

- Updated dependencies [40caf1a]
  - @authhero/adapter-interfaces@0.105.0
  - @authhero/kysely-adapter@10.64.0

## 2.14.1

### Patch Changes

- Updated dependencies [125dbb9]
  - @authhero/adapter-interfaces@0.104.0
  - @authhero/kysely-adapter@10.63.1

## 2.14.0

### Minor Changes

- 521e436: Send batch of messages

## 2.13.1

### Patch Changes

- Updated dependencies [b0c4421]
- Updated dependencies [c96d83b]
  - @authhero/adapter-interfaces@0.103.0
  - @authhero/kysely-adapter@10.63.0

## 2.13.0

### Minor Changes

- e04bae4: Update the logging handle geoip correctly
- 731c191: Fix paging issues with custom domains

### Patch Changes

- Updated dependencies [731c191]
  - @authhero/kysely-adapter@10.61.0

## 2.12.0

### Minor Changes

- 0566155: Remove country 3 and country name fields

### Patch Changes

- Updated dependencies [0566155]
- Updated dependencies [0566155]
  - @authhero/adapter-interfaces@0.102.0
  - @authhero/kysely-adapter@10.60.0

## 2.11.1

### Patch Changes

- Updated dependencies [0ffb5ca]
  - @authhero/adapter-interfaces@0.101.0
  - @authhero/kysely-adapter@10.58.0

## 2.11.0

### Minor Changes

- 1988826: Update the binding for cloudflare pipelines

## 2.10.0

### Minor Changes

- d381383: Use env for writing logs to R2 pipeline

## 2.9.0

### Minor Changes

- 3a0d8ee: Add geo info

### Patch Changes

- Updated dependencies [3a0d8ee]
  - @authhero/adapter-interfaces@0.100.0
  - @authhero/kysely-adapter@10.57.0

## 2.8.0

### Minor Changes

- a3c69f0: Add support for logs with cloudflare sql

### Patch Changes

- Updated dependencies [a3c69f0]
  - @authhero/adapter-interfaces@0.99.0
  - @authhero/kysely-adapter@10.56.0

## 2.7.6

### Patch Changes

- 6067f00: Update the hook names
- Updated dependencies [6067f00]
  - @authhero/adapter-interfaces@0.98.0
  - @authhero/kysely-adapter@10.55.1

## 2.7.5

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.97.0

## 2.7.4

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.96.0

## 2.7.3

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.95.0

## 2.7.2

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.94.0

## 2.7.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.93.0

## 2.7.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.92.0

## 2.6.0

### Patch Changes

- Updated dependencies [149ab91]
- Updated dependencies [b0e9595]
  - @authhero/adapter-interfaces@0.91.0

## 2.5.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.90.0

## 2.4.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.89.0

## 2.3.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.88.0

## 2.2.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.87.0

## 2.1.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.86.0

## 2.0.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.85.0

## 1.28.0

### Minor Changes

- Fix the caching

## 1.27.0

### Minor Changes

- Export the cache

## 1.26.0

### Minor Changes

- Bump version for cloudfalre

## 1.24.0

### Minor Changes

- Add a cache adapter

## 1.23.0

### Minor Changes

- Add cache adapter

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.84.0

## 1.22.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.83.0

## 1.21.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.82.0

## 1.20.0

### Patch Changes

- Updated dependencies [fc8153d]
  - @authhero/adapter-interfaces@0.81.0

## 1.19.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.80.0

## 1.18.0

### Minor Changes

- Add resource servers, rules and permissions

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.79.0

## 1.17.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.78.0

## 10.26.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.77.0

## 1.25.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.76.0

## 1.24.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.75.0

## 1.23.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.74.0

## 1.22.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.73.0

## 1.21.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.72.0

## 1.20.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.71.0

## 1.19.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.70.0

## 1.18.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.69.0

## 1.17.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.68.0

## 1.16.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.67.0

## 1.15.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.66.0

## 1.14.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.65.0

## 1.13.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.64.0

## 1.12.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.63.0

## 1.11.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.62.0

## 1.10.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.61.0

## 1.9.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.60.0

## 1.8.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.59.0

## 1.7.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.58.0

## 1.6.1

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.57.0

## 1.6.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.56.0

## 1.5.0

### Minor Changes

- Add a getByDomain function for cutsom domains and a tenant-id middleware

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.55.0

## 1.4.0

### Minor Changes

- Update schemas and logic for valiation of domains

## 1.3.0

### Minor Changes

- Add domain verification info

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.54.0

## 1.2.0

### Minor Changes

- Do not list custom domains from other tenants

## 1.1.0

### Minor Changes

- Make the cloudflare custom domains adapter use another adpater for storage

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.53.0

## 1.0.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.52.0

## 0.7.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.51.0

## 0.6.0

### Patch Changes

- Updated dependencies
  - @authhero/adapter-interfaces@0.50.0

## 0.5.0

### Patch Changes

- Updated dependencies [a9959ad]
  - @authhero/adapter-interfaces@0.49.0

## 0.4.0

### Minor Changes

- Handle that enterprise is needed for custom metadata

## 0.3.0

### Minor Changes

- Use auth key and auth email instead of bearer

## 0.2.0

### Minor Changes

- Add create domain

## 0.1.0

### Minor Changes

- Add a cloudflare adapter
