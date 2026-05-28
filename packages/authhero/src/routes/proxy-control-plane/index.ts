import { Hono, type Handler } from "hono";
import type { ResolvedHost } from "@authhero/proxy";

export interface ProxyControlPlaneOptions {
  /**
   * Cross-tenant host resolver. Typically delegated to a database adapter's
   * `createProxyDataAdapter(db).resolveHost`.
   */
  resolveHost: (host: string) => Promise<ResolvedHost | null>;

  /**
   * Authentication check for incoming requests. Return `true` to allow,
   * `false` to reject with 401. The control-plane endpoint is cross-tenant
   * and must not be exposed to regular tenant tokens — use a dedicated
   * proxy-reader credential (shared secret, mTLS, JWT with `proxy:resolve_host`
   * scope, …).
   */
  authenticate: (request: Request) => Promise<boolean> | boolean;
}

/**
 * Returns a Hono app exposing the privileged proxy control-plane endpoint
 * `GET /hosts/:host`. Mount under `/api/v2/proxy/control-plane`.
 */
export function createProxyControlPlaneApp(
  options: ProxyControlPlaneOptions,
): Hono {
  const app = new Hono();

  const handler: Handler = async (c) => {
    const ok = await options.authenticate(c.req.raw);
    if (!ok) {
      return c.text("Unauthorized", 401, {
        "WWW-Authenticate": "Bearer",
      });
    }

    const host = c.req.param("host");
    if (!host) return c.text("Missing host", 400);

    const resolved = await options.resolveHost(host);
    if (!resolved) return c.text("Unknown host", 404);

    return c.json(resolved);
  };

  app.get("/hosts/:host", handler);
  return app;
}
