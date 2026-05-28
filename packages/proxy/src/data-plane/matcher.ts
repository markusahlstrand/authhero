import type { Context } from "hono";
import type { ProxyRoute, RouteMatch } from "../types";

export function sortRoutes(routes: ProxyRoute[]): ProxyRoute[] {
  return [...routes].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.created_at.localeCompare(b.created_at);
  });
}

/**
 * Match a configured host pattern against a request's `Host`. Supports
 * exact match and `*.example.com` wildcard prefix.
 */
export function matchesHost(pattern: string, host: string): boolean {
  const p = pattern.toLowerCase();
  const h = host.toLowerCase();
  if (p === h) return true;
  if (p.startsWith("*.")) {
    const suffix = p.slice(1); // ".example.com"
    return h.endsWith(suffix) && h.length > suffix.length;
  }
  return false;
}

export function matchesAnyHost(
  patterns: string[] | undefined,
  host: string,
): boolean {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some((p) => matchesHost(p, host));
}

/**
 * Filter Hono middleware that 404s when the route's `match.headers` /
 * `match.query` / `match.hosts` predicates don't hold. Path and method
 * matching is done by Hono itself via `app.on(methods, path, ...)`.
 */
export function buildMatchFilter(match: RouteMatch) {
  const headerEntries = match.headers ? Object.entries(match.headers) : [];
  const headerRegexes = headerEntries.map(
    ([name, pattern]) => [name.toLowerCase(), new RegExp(pattern)] as const,
  );

  const queryEntries = match.query ? Object.entries(match.query) : [];
  const queryRegexes = queryEntries.map(
    ([name, pattern]) => [name, new RegExp(pattern)] as const,
  );

  const hostPatterns = match.hosts;

  return async (c: Context, next: () => Promise<void>) => {
    if (hostPatterns) {
      const host = c.req.header("host") ?? "";
      if (!matchesAnyHost(hostPatterns, host)) {
        return new Response("No matching route", { status: 404 });
      }
    }

    for (const [name, regex] of headerRegexes) {
      const value = c.req.header(name);
      if (value === undefined || !regex.test(value)) {
        return new Response("No matching route", { status: 404 });
      }
    }

    if (queryRegexes.length > 0) {
      const url = new URL(c.req.url);
      for (const [name, regex] of queryRegexes) {
        const value = url.searchParams.get(name);
        if (value === null || !regex.test(value)) {
          return new Response("No matching route", { status: 404 });
        }
      }
    }

    await next();
  };
}
