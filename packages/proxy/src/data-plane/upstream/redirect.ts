import { ProxyRoute } from "../../types";

export function dispatchRedirect(route: ProxyRoute, req: Request): Response {
  const inUrl = new URL(req.url);
  const target = new URL(route.upstream_url);
  if (!target.pathname || target.pathname === "/") {
    target.pathname = inUrl.pathname;
    target.search = inUrl.search;
  }
  return new Response(null, {
    status: 302,
    headers: { location: target.toString() },
  });
}
