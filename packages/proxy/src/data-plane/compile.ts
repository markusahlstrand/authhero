import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { ProxyRoute } from "../types";
import { HandlerRegistry } from "./registry";
import { buildMatchFilter, sortRoutes } from "./matcher";
import { setProxyHostContext, type ProxyHostContext } from "./handlers/util";

const ALL_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
];

/**
 * Build a Hono app whose route table mirrors the configured proxy routes for
 * a single host. Compiled once per host (and cached alongside the resolved
 * host) — see `cache.ts`. When `hostContext` is supplied, every request
 * served by the compiled app gets `tenant_id`, `custom_domain_id`, and
 * `domain` set in its Hono context (read with `getProxy*` helpers from
 * `handlers/util.ts`). Handlers that template against those values
 * (`dispatch_namespace`) depend on this wiring.
 */
export function compileHostApp(
  routes: ProxyRoute[],
  registry: HandlerRegistry,
  hostContext?: ProxyHostContext,
): Hono {
  const app = new Hono();

  if (hostContext) {
    app.use("*", async (c, next) => {
      setProxyHostContext(c, hostContext);
      await next();
    });
  }

  const sorted = sortRoutes(routes);

  for (const route of sorted) {
    const handlers: MiddlewareHandler[] = [];
    handlers.push(buildMatchFilter(route.match));
    for (const h of route.handlers) {
      handlers.push(registry.build(h.type, h.options));
    }

    const methods = route.match.methods?.length
      ? route.match.methods.map((m) => m.toUpperCase())
      : ALL_METHODS;

    const path = route.match.path || "/*";

    app.on(methods, [path], ...handlers);
  }

  // Fallback for the host if no route matches.
  app.all("*", (c) => c.text("No matching route", 404));

  return app;
}
