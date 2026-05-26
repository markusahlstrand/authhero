import { Hono } from "hono";
import type { Context } from "hono";
import { ProxyDataAdapter } from "../adapter";
import { createInMemoryHostCache, HostResolverCache } from "./cache";
import { matchRoute } from "./matcher";
import { runRoute } from "./pipeline";

export interface ProxyDataPlaneOptions {
  data: ProxyDataAdapter;
  cacheTtlMs?: number;
  resolver?: HostResolverCache;
}

export function createProxyDataPlaneHandler(
  options: ProxyDataPlaneOptions,
): (c: Context) => Promise<Response> {
  const ttl = options.cacheTtlMs ?? 30_000;
  const resolver =
    options.resolver ?? createInMemoryHostCache(options.data, ttl);

  return async (c) => {
    const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
    if (!host) return c.text("Missing host", 400);

    const resolved = await resolver.resolveHost(host);
    if (!resolved) return c.text("Unknown host", 404);

    const url = new URL(c.req.url);
    const route = matchRoute(resolved.routes, url.pathname);
    if (!route) return c.text("No matching route", 404);

    return runRoute(route, c.req.raw);
  };
}

export function createProxyDataPlaneRouter(
  options: ProxyDataPlaneOptions,
): Hono {
  const app = new Hono();
  app.all("*", createProxyDataPlaneHandler(options));
  return app;
}
