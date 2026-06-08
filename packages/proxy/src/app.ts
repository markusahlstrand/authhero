import { Hono } from "hono";
import { ProxyDataAdapter } from "./adapter";
import { createProxyDataPlaneHandler } from "./data-plane/router";
import type { HostCacheOptions, HostResolverCache } from "./data-plane/cache";
import type { HandlerRegistry } from "./data-plane/registry";

export interface ProxyAppOptions {
  data: ProxyDataAdapter;
  cacheTtlMs?: number;
  cache?: HostCacheOptions;
  // Pre-built host resolver. Takes precedence over `cache`/`cacheTtlMs` —
  // use this to plug in `createCacheAdapterHostCache`, layered caches, etc.
  resolver?: HostResolverCache;
  registry?: HandlerRegistry;
  bindings?: Record<string, unknown>;
}

export function createProxyApp(options: ProxyAppOptions): Hono {
  const app = new Hono();

  app.all(
    "*",
    createProxyDataPlaneHandler({
      data: options.data,
      cacheTtlMs: options.cacheTtlMs,
      cache: options.cache,
      resolver: options.resolver,
      registry: options.registry,
      bindings: options.bindings,
    }),
  );

  return app;
}
