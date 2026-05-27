import { ProxyRoute } from "../types";

export function matchRoute(
  routes: ProxyRoute[],
  pathname: string,
): ProxyRoute | null {
  const sorted = [...routes].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.created_at.localeCompare(b.created_at);
  });

  for (const route of sorted) {
    if (matchesPattern(route.path_pattern, pathname)) {
      return route;
    }
  }
  return null;
}

export function matchesPattern(pattern: string, pathname: string): boolean {
  if (pattern === "" || pattern === "/" || pattern === "/*") return true;

  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -2);
    return pathname === prefix || pathname.startsWith(prefix + "/");
  }

  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return pathname.startsWith(prefix);
  }

  return pathname === pattern || pathname.startsWith(pattern + "/");
}
