import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { ProxyRoute } from "../types";
import { HandlerRegistry } from "./registry";
import { buildMatchFilter, sortRoutes } from "./matcher";

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

/**
 * Build a Hono app whose route table mirrors the configured proxy routes for
 * a single host. Compiled once per host (and cached alongside the resolved
 * host) — see `cache.ts`.
 */
export function compileHostApp(
  routes: ProxyRoute[],
  registry: HandlerRegistry,
): Hono {
  const app = new Hono();
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
