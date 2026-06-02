import { drizzle } from "drizzle-orm/d1";
import { createProxyDataAdapter } from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import {
  createProxyApp,
  type ProxyDataAdapter,
  type ResolvedHost,
} from "@authhero/proxy";
import type { Env } from "./types";

// `tenant-{tenant_id}-auth` is the deploy convention used by this template's
// per-tenant worker setup. Override with the SCRIPT_NAME_TEMPLATE env var or
// by configuring proxy_routes rows per tenant for richer routing.
const DEFAULT_SCRIPT_NAME_TEMPLATE = "tenant-{tenant_id}-auth";

// If a host resolves to a known tenant but has no proxy_routes configured,
// synthesize a single catch-all that dispatches to the tenant's auth worker
// in the namespace. Operators who need middleware (CORS, headers, rate
// limiting) per tenant can add real proxy_routes rows and this fallback
// stays out of the way.
function withDefaultDispatchRoute(
  inner: ProxyDataAdapter,
  binding: string,
  scriptNameTemplate: string,
): ProxyDataAdapter {
  return {
    proxyRoutes: inner.proxyRoutes,
    resolveHost: async (host): Promise<ResolvedHost | null> => {
      const resolved = await inner.resolveHost(host);
      if (!resolved || resolved.routes.length > 0) return resolved;
      const now = new Date(0).toISOString();
      return {
        ...resolved,
        routes: [
          {
            id: `default-${resolved.custom_domain_id}`,
            tenant_id: resolved.tenant_id,
            custom_domain_id: resolved.custom_domain_id,
            priority: 1000,
            match: { path: "/*" },
            handlers: [
              {
                type: "dispatch_namespace",
                options: { binding, script_name: scriptNameTemplate },
              },
            ],
            created_at: now,
            updated_at: now,
          },
        ],
      };
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = drizzle(env.AUTH_DB, { schema });
    const data = withDefaultDispatchRoute(
      createProxyDataAdapter(db),
      "DISPATCHER",
      env.SCRIPT_NAME_TEMPLATE || DEFAULT_SCRIPT_NAME_TEMPLATE,
    );

    const app = createProxyApp({
      data,
      bindings: { DISPATCHER: env.DISPATCHER },
    });

    return app.fetch(request);
  },
};
