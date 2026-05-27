import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { ProxyDataAdapter } from "./adapter";
import { createProxyDataPlaneHandler } from "./data-plane/router";
import type { HostCacheOptions } from "./data-plane/cache";
import { createProxyManagementRouter } from "./management/router";

export interface ProxyAppOptions {
  data: ProxyDataAdapter;
  // Legacy shorthand for { freshTtlMs: cacheTtlMs }.
  cacheTtlMs?: number;
  cache?: HostCacheOptions;
  management?: {
    path?: string;
    auth?: MiddlewareHandler<{ Variables: { tenant_id: string } }>;
  };
}

export function createProxyApp(options: ProxyAppOptions): Hono {
  const app = new Hono();

  if (options.management) {
    const path = options.management.path ?? "/__proxy/routes";
    const managementRouter = createProxyManagementRouter({
      data: options.data,
      auth: options.management.auth,
    });
    app.route(path, managementRouter);
  }

  app.all(
    "*",
    createProxyDataPlaneHandler({
      data: options.data,
      cacheTtlMs: options.cacheTtlMs,
      cache: options.cache,
    }),
  );

  return app;
}
