import { Hono } from "hono";
import { ProxyDataAdapter } from "./adapter";
import { createProxyDataPlaneHandler } from "./data-plane/router";
import type { ProxyRouteHandlerSpec } from "./data-plane/router";
import type { HostCacheOptions, HostResolverCache } from "./data-plane/cache";
import type { HandlerRegistry } from "./data-plane/registry";
import { isTimeoutLike } from "./data-plane/timeout";

export interface ProxyAppOptions {
  data: ProxyDataAdapter;
  cacheTtlMs?: number;
  cache?: HostCacheOptions;
  // Pre-built host resolver. Takes precedence over `cache`/`cacheTtlMs` —
  // use this to plug in `createCacheAdapterHostCache`, layered caches, etc.
  resolver?: HostResolverCache;
  registry?: HandlerRegistry;
  bindings?: Record<string, unknown>;
  // Defense-in-depth ceiling (ms) on `resolver.resolveHost()`. Defaults to
  // 10000. If the resolver hangs longer than `resolveHostTimeoutMs`, the
  // proxy returns 504 instead of letting the CF runtime cancel the request
  // as `outcome: exception`. Must comfortably exceed the sum of inner
  // adapter/cache fetch timeouts so it acts as a true ceiling and doesn't
  // race the inner aborts.
  resolveHostTimeoutMs?: number;
  // Catch-all handler chain run when no per-host route matches AND when the
  // control-plane resolve fails (unknown host, timeout, or error). Matches
  // the `default` upstream semantic of the legacy file-config proxy — known
  // hosts with empty `proxy_routes` rows serve through this chain instead of
  // 404, and a slow/unreachable control plane fails open to this chain
  // instead of returning 504/502.
  //
  // ```ts
  // defaultHandlers: [
  //   { type: "http", options: { upstream_url: "https://auth2.sesamy.com" } },
  // ]
  // ```
  defaultHandlers?: ProxyRouteHandlerSpec[];
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
      resolveHostTimeoutMs: options.resolveHostTimeoutMs,
      defaultHandlers: options.defaultHandlers,
    }),
  );

  // Global error handler: any throw that escapes the per-route try/catch
  // (build-time registry errors, framework bugs, hung resolver promises)
  // surfaces as a structured 5xx instead of an unhandled rejection that the
  // CF runtime turns into `outcome: exception`.
  app.onError((err, c) => {
    const isTimeout = isTimeoutLike(err);
    return c.text(
      isTimeout ? "Proxy timeout" : "Bad gateway",
      isTimeout ? 504 : 502,
      {
        "x-authhero-proxy-error": isTimeout ? "proxy_timeout" : "proxy_error",
      },
    );
  });

  return app;
}
