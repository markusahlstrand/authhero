/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Canonical tenant-worker entrypoint for a Workers-for-Platforms + D1
 * authhero deployment. Reference only — copy into your own tenant-worker
 * source tree and bundle from there (this file is not bundled into
 * `@authhero/cloudflare-adapter`'s `dist`).
 *
 * The bundle the provisioner uploads must be a single self-contained ESM
 * `.js`. Operators build it themselves so they can layer in custom hooks,
 * code-executors, secrets, etc. Below is the minimal shape every operator
 * needs.
 *
 * Env contract set by `createCloudflareWfpD1Provisioner.onProvision`:
 *
 *  | Name                     | Source       | Purpose                                              |
 *  | ------------------------ | ------------ | ---------------------------------------------------- |
 *  | AUTH_DB                  | D1 binding   | Per-tenant database                                  |
 *  | CONTROL_PLANE_BASE_URL   | plain_text   | Target of `controlPlaneSync` outbox destination      |
 *  | ENCRYPTION_KEY           | secret_text  | Encryption at rest (must be byte-stable across plane)|
 *  | ISSUER                   | secret_text  | `iss` claim in JWTs                                  |
 *  | …additional secrets…     | secret_text  | JWKS, mail creds, OAuth client secrets, etc.         |
 *
 * Recommended bundler call:
 *
 * ```sh
 * esbuild src/tenant-worker.ts \
 *   --bundle --format=esm --platform=neutral --target=es2022 \
 *   --conditions=workerd,worker,browser \
 *   --outfile=dist/tenant-worker.js
 * ```
 *
 * Wiring into the provisioner (control-plane authhero side):
 *
 * ```ts
 * import tenantWorkerScript from "./tenant-worker.dist.js?raw";
 * import { createCloudflareWfpD1Provisioner } from "@authhero/cloudflare-adapter";
 *
 * const provisioner = createCloudflareWfpD1Provisioner({
 *   accountId,
 *   apiToken,
 *   dispatchNamespace: "authhero-tenants",
 *   controlPlaneBaseUrl: env.PUBLIC_BASE_URL,
 *   tenantWorkerScript,
 *   migrations: [
 *     { name: "0000_initial.sql", sql: initialMigrationSql },
 *     // ...one entry per @authhero/drizzle migration file, in order
 *   ],
 *   secrets: async (tenantId) => ({
 *     ENCRYPTION_KEY: env.SHARED_ENCRYPTION_KEY,  // byte-stable across all tenants
 *     ISSUER: `https://${tenantId}.tokens.example.com`,
 *     // …whichever else authhero reads from env
 *   }),
 * });
 * ```
 *
 * Minimal tenant-worker source (copy and adapt):
 *
 * ```ts
 * import { drizzle } from "drizzle-orm/d1";
 * import createDataAdapters from "@authhero/drizzle";
 * import { init } from "authhero";
 *
 * interface TenantWorkerEnv {
 *   AUTH_DB: D1Database;
 *   CONTROL_PLANE_BASE_URL: string;
 *   ENCRYPTION_KEY: string;
 *   ISSUER: string;
 *   // …your additional secrets
 * }
 *
 * export default {
 *   async fetch(
 *     request: Request,
 *     env: TenantWorkerEnv,
 *     ctx: ExecutionContext,
 *   ): Promise<Response> {
 *     const db = drizzle(env.AUTH_DB);
 *     const dataAdapter = createDataAdapters(db);
 *
 *     const { app } = init({
 *       dataAdapter,
 *       controlPlaneSync: {
 *         baseUrl: env.CONTROL_PLANE_BASE_URL,
 *         timeoutMs: 10_000,
 *       },
 *     });
 *
 *     return app.fetch(request, env, ctx);
 *   },
 * };
 * ```
 */
export {};
