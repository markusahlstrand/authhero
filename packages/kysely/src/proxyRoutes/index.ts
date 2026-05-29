import { Kysely } from "kysely";
import type { ProxyDataAdapter } from "@authhero/proxy";
import { Database } from "../db";
import { createProxyRoutesAdapter } from "./adapter";
import { resolveHostFromKysely } from "./resolve-host";

export { createProxyRoutesAdapter } from "./adapter";

/**
 * Build a full `ProxyDataAdapter` (CRUD + cross-tenant `resolveHost`) for the
 * `@authhero/proxy` data plane. Authhero itself only needs the CRUD adapter
 * surfaced via `createAdapters(db).proxyRoutes`; a separate proxy worker
 * process uses this helper when reading directly from the same database.
 */
export function createProxyDataAdapter(db: Kysely<Database>): ProxyDataAdapter {
  return {
    proxyRoutes: createProxyRoutesAdapter(db),
    resolveHost: (host) => resolveHostFromKysely(db, host),
  };
}
