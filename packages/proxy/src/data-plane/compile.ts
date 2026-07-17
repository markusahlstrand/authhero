import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { ProxyRoute } from "../types";
import { HandlerRegistry } from "./registry";
import { buildMatchFilter, sortRoutes } from "./matcher";
import { setProxyHostContext, type ProxyHostContext } from "./handlers/util";
import { isTimeoutLike } from "./timeout";

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
 *
 * `defaultHandlers` is a prebuilt middleware chain installed as the catch-all
 * when no per-host route matches. Pass `undefined` to keep the legacy 404
 * "No matching route" behavior.
 */
export function compileHostApp(
  routes: ProxyRoute[],
  registry: HandlerRegistry,
  hostContext?: ProxyHostContext,
  defaultHandlers?: MiddlewareHandler[],
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

  // Fallback for the host if no route matches. With `defaultHandlers`
  // configured, run that chain instead of the 404 — matches the "default
  // upstream" semantic of the legacy file-config proxy and keeps known hosts
  // with empty `proxy_routes` rows serving traffic instead of 404-ing.
  if (defaultHandlers && defaultHandlers.length > 0) {
    app.on(ALL_METHODS, ["*"], ...defaultHandlers);
  } else {
    app.all("*", (c) => c.text("No matching route", 404));
  }

  // Convert any unhandled throw from a route's handler chain into a structured
  // 502 (or 504 if the throw was timeout-like). Without this, Hono returns its
  // default 500 with no error header, which doesn't reach the outer router's
  // try/catch — `hostApp.fetch()` resolves successfully with the 500.
  app.onError((err, c) => {
    const isTimeout = isTimeoutLike(err);
    return c.text(
      isTimeout ? "Upstream timeout" : "Bad gateway",
      isTimeout ? 504 : 502,
      {
        "x-authhero-proxy-error": isTimeout
          ? "handler_timeout"
          : "handler_failed",
      },
    );
  });

  return app;
}
