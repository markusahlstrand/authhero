import { Kysely } from "kysely";
import { ProxyDataAdapter } from "../adapter";
import { createProxyRoutesAdapter } from "./proxy-routes";
import { resolveHostFromKysely } from "./resolve-host";
import { ProxyDatabase } from "./schema";

export function createKyselyProxyDataAdapter(
  db: Kysely<ProxyDatabase>,
): ProxyDataAdapter {
  return {
    proxyRoutes: createProxyRoutesAdapter(db),
    resolveHost: (host) => resolveHostFromKysely(db, host),
  };
}

export type { ProxyDatabase, ProxyRoutesTable } from "./schema";
