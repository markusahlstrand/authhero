import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { ProxyDataAdapter } from "./adapter";
import { createProxyDataPlaneHandler } from "./data-plane/router";
import { createProxyManagementRouter } from "./management/router";

export interface ProxyAppOptions {
  data: ProxyDataAdapter;
  cacheTtlMs?: number;
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
    }),
  );

  return app;
}
