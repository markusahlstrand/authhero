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

export interface ProxyDataPlaneOptions {
  data: ProxyDataAdapter;
  cacheTtlMs?: number;
  cache?: HostCacheOptions;
  resolver?: HostResolverCache;
  registry?: HandlerRegistry;
  bindings?: Record<string, unknown>;
}

function buildResolver(options: ProxyDataPlaneOptions): HostResolverCache {
  if (options.resolver) return options.resolver;
  if (options.cache) return createInMemoryHostCache(options.data, options.cache);
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

  return async (c) => {
    const host = c.req.header("host") ?? c.req.header("x-forwarded-host");
    if (!host) return c.text("Missing host", 400);

    const resolved = await resolver.resolveHost(host);
    if (!resolved) return c.text("Unknown host", 404);

    let hostApp = compiled.get(resolved);
    if (!hostApp) {
      hostApp = compileHostApp(resolved.routes, registry);
      compiled.set(resolved, hostApp);
    }

    return hostApp.fetch(c.req.raw);
  };
}

export function createProxyDataPlaneRouter(
  options: ProxyDataPlaneOptions,
): Hono {
  const app = new Hono();
  app.all("*", createProxyDataPlaneHandler(options));
  return app;
}
