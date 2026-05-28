import type { ProxyDataAdapter } from "@authhero/proxy";
import { createProxyRoutesAdapter } from "./proxyRoutes";
import { resolveHostFromDrizzle } from "./resolveHost";
import type { DrizzleDb } from "./types";

/**
 * Build a full `ProxyDataAdapter` (CRUD + cross-tenant `resolveHost`) for the
 * `@authhero/proxy` data plane. The authhero server only needs the CRUD
 * adapter surfaced via `createAdapters(db).proxyRoutes`; a separate proxy
 * worker process uses this helper when reading directly from the same
 * database.
 */
export function createProxyDataAdapter(db: DrizzleDb): ProxyDataAdapter {
  return {
    proxyRoutes: createProxyRoutesAdapter(db),
    resolveHost: (host) => resolveHostFromDrizzle(db, host),
  };
}
