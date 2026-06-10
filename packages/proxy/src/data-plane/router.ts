import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
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

export interface ProxyRouteHandlerSpec {
  type: string;
  options?: unknown;
}

const DEFAULT_RESOLVE_HOST_TIMEOUT_MS = 10_000;

export interface ProxyDataPlaneOptions {
  data: ProxyDataAdapter;
  cacheTtlMs?: number;
  cache?: HostCacheOptions;
  resolver?: HostResolverCache;
  registry?: HandlerRegistry;
  bindings?: Record<string, unknown>;
  // Defense-in-depth ceiling (ms) on `resolver.resolveHost()`. Defaults to
  // 10000. Adapters and cache layers ship their own (tighter) timeouts; this
  // outer bound must comfortably exceed the sum of inner fetches so a
  // misbehaving custom resolver hits the ceiling without shadowing the
  // structured errors the adapter would otherwise raise.
  resolveHostTimeoutMs?: number;
  // Catch-all handler chain run when no per-host route matches AND when the
  // control-plane resolve fails (unknown host, timeout, or error). Fail-open
  // semantics — matches the `default` upstream of the legacy file-config
  // proxy. Without this, those cases return 404/504/502 respectively. Each
  // entry is built through the same `HandlerRegistry` as normal routes, so
  // you can stack middleware (e.g. forwarded_headers, http) in the chain.
  defaultHandlers?: ProxyRouteHandlerSpec[];
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

  // Pre-build the catch-all chain once at init time. Built handlers are
  // shared between (a) the per-host compileHostApp fallback (no-route-match)
  // and (b) the router-level fail-open path (unknown host / resolve failure).
  const defaultHandlersBuilt: MiddlewareHandler[] | undefined =
    options.defaultHandlers && options.defaultHandlers.length > 0
      ? options.defaultHandlers.map((h) => registry.build(h.type, h.options))
      : undefined;
  // Standalone Hono app that runs only the catch-all chain. Used when no
  // host context is available (resolve returned null, timed out, or threw).
  const defaultApp: Hono | undefined = defaultHandlersBuilt
    ? compileHostApp([], registry, undefined, defaultHandlersBuilt)
    : undefined;

  return async (c) => {
    const host = c.req.header("host") ?? c.req.header("x-forwarded-host");
    if (!host) return c.text("Missing host", 400);

    try {
      const resolved = await withRaceTimeout(
        resolver.resolveHost(host),
        resolveHostTimeoutMs,
        "resolveHost",
      );
      if (!resolved) {
        if (defaultApp) return await defaultApp.fetch(c.req.raw);
        return c.text("Unknown host", 404);
      }

      let hostApp = compiled.get(resolved);
      if (!hostApp) {
        // `compileHostApp` runs `registry.build(...)` for every handler in the
        // route table, which throws on unknown handler types or invalid
        // options. That throw is caught by the outer try/catch below and
        // surfaces as a 502 instead of an unhandled exception.
        hostApp = compileHostApp(
          resolved.routes,
          registry,
          {
            tenant_id: resolved.tenant_id,
            custom_domain_id: resolved.custom_domain_id,
            domain: resolved.domain,
          },
          defaultHandlersBuilt,
        );
        compiled.set(resolved, hostApp);
      }

      return await hostApp.fetch(c.req.raw);
    } catch (err) {
      // Defense-in-depth: every per-handler path already converts its own
      // failures to a clean response, so this only fires for unexpected
      // throws (resolver hangs, registry build errors, framework bugs).
      // With `defaultHandlers` configured we fail open to the default chain
      // so the proxy keeps serving traffic when the control plane is slow or
      // unreachable. Without it, return a structured 5xx so the CF runtime
      // doesn't cancel the request as `outcome: exception`.
      if (defaultApp) return await defaultApp.fetch(c.req.raw);
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
