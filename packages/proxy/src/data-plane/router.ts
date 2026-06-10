import { Hono } from "hono";
import type { Context } from "hono";
import { ProxyDataAdapter } from "../adapter";
import {
  createInMemoryHostCache,
  HostCacheOptions,
  HostResolverCache,
} from "./cache";
import { HandlerRegistry } from "./registry";
import { registerBuiltinHandlers } from "./handlers";
import { compileHostApp } from "./compile";
import { isTimeoutLike, withRaceTimeout } from "./timeout";

const DEFAULT_RESOLVE_HOST_TIMEOUT_MS = 5_000;

export interface ProxyDataPlaneOptions {
  data: ProxyDataAdapter;
  cacheTtlMs?: number;
  cache?: HostCacheOptions;
  resolver?: HostResolverCache;
  registry?: HandlerRegistry;
  bindings?: Record<string, unknown>;
  // Defense-in-depth ceiling (ms) on `resolver.resolveHost()`. Defaults to
  // 5000. Adapters and cache layers ship their own timeouts, but the router
  // adds an outer bound so a misbehaving custom resolver can never hang the
  // request past this window.
  resolveHostTimeoutMs?: number;
}

function buildResolver(options: ProxyDataPlaneOptions): HostResolverCache {
  if (options.resolver) return options.resolver;
  if (options.cache)
    return createInMemoryHostCache(options.data, options.cache);
  return createInMemoryHostCache(options.data, options.cacheTtlMs ?? 30_000);
}

function buildRegistry(options: ProxyDataPlaneOptions): HandlerRegistry {
  if (options.registry) return options.registry;
  const registry = new HandlerRegistry(options.bindings ?? {});
  registerBuiltinHandlers(registry);
  return registry;
}

export function createProxyDataPlaneHandler(
  options: ProxyDataPlaneOptions,
): (c: Context) => Promise<Response> {
  const resolver = buildResolver(options);
  const registry = buildRegistry(options);
  const compiled = new WeakMap<object, Hono>();
  const resolveHostTimeoutMs =
    options.resolveHostTimeoutMs ?? DEFAULT_RESOLVE_HOST_TIMEOUT_MS;

  return async (c) => {
    const host = c.req.header("host") ?? c.req.header("x-forwarded-host");
    if (!host) return c.text("Missing host", 400);

    try {
      const resolved = await withRaceTimeout(
        resolver.resolveHost(host),
        resolveHostTimeoutMs,
        "resolveHost",
      );
      if (!resolved) return c.text("Unknown host", 404);

      let hostApp = compiled.get(resolved);
      if (!hostApp) {
        // `compileHostApp` runs `registry.build(...)` for every handler in the
        // route table, which throws on unknown handler types or invalid
        // options. That throw is caught by the outer try/catch below and
        // surfaces as a 502 instead of an unhandled exception.
        hostApp = compileHostApp(resolved.routes, registry, {
          tenant_id: resolved.tenant_id,
          custom_domain_id: resolved.custom_domain_id,
          domain: resolved.domain,
        });
        compiled.set(resolved, hostApp);
      }

      return await hostApp.fetch(c.req.raw);
    } catch (err) {
      // Defense-in-depth: every per-handler path already converts its own
      // failures to a clean response, so this only fires for unexpected
      // throws (resolver hangs, registry build errors, framework bugs).
      // Returning a structured 5xx prevents the CF runtime from cancelling
      // the request as `outcome: exception` and losing observability.
      if (isTimeoutLike(err)) {
        return c.text(`Resolve host timed out after ${resolveHostTimeoutMs}ms`, 504, {
          "x-authhero-proxy-error": "resolve_host_timeout",
        });
      }
      return c.text("Bad gateway", 502, {
        "x-authhero-proxy-error": "data_plane_error",
      });
    }
  };
}

export function createProxyDataPlaneRouter(
  options: ProxyDataPlaneOptions,
): Hono {
  const app = new Hono();
  app.all("*", createProxyDataPlaneHandler(options));
  return app;
}
