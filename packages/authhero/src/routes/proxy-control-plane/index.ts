import { Hono, type Handler } from "hono";
import type { ResolvedHost } from "@authhero/proxy";
import {
  CustomDomain,
  CustomDomainsAdapter,
  ProxyRoute,
  proxyRouteSchema,
  ProxyRoutesAdapter,
} from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";
import { SyncEvent } from "../../helpers/control-plane-sync-events";
import { Bindings } from "../../types";
import { createCustomDomainsControlPlaneApp } from "./custom-domains";
import {
  CONTROL_PLANE_CUSTOM_DOMAINS_SCOPE,
  CONTROL_PLANE_SYNC_SCOPE,
  PROXY_RESOLVE_HOST_SCOPE,
} from "./scopes";
import {
  verifyControlPlaneToken,
  type VerifyControlPlaneTokenResult,
} from "./verify";

const syncEventSchema = z.object({
  event_id: z.string(),
  tenant_id: z.string(),
  entity: z.literal("proxy_route"),
  op: z.enum(["created", "updated", "deleted"]),
  aggregate_id: z.string(),
  payload: proxyRouteSchema,
  occurred_at: z.string(),
});

const syncRequestSchema = z.object({
  events: z.array(syncEventSchema).min(1),
});

export interface ProxyControlPlaneOptions {
  /**
   * Cross-tenant host resolver. Typically delegated to a database adapter's
   * `createProxyDataAdapter(db).resolveHost`.
   */
  resolveHost: (host: string) => Promise<ResolvedHost | null>;

  /**
   * Optional fetch override for the per-issuer JWKS document. Called with
   * the derived URL (`<iss>/.well-known/jwks.json`); defaults to global
   * `fetch`. Hosts on Cloudflare Workers can route specific hosts through a
   * service binding by inspecting the URL and dispatching accordingly.
   */
  jwksFetch?: (url: string) => Promise<Response>;

  /**
   * Optional handler for `POST /sync` — receives `controlplane.sync.*` events
   * emitted by tenant shards via `ControlPlaneSyncDestination` and replicates
   * the mutation into the control-plane data store. When omitted, the
   * `/sync` route is not mounted (control-plane is read-only).
   *
   * Implementations MUST be idempotent: the outbox retries on transient
   * failures even after the receiver applied the change.
   * `createApplySyncEvents` wires this to a local adapter with idempotent
   * semantics.
   *
   * Custom domains do NOT flow through here — the control plane is
   * authoritative for them (see `customDomains` below); only `proxy_route`
   * replicates upward.
   */
  applySyncEvents?: (events: SyncEvent[]) => Promise<void>;

  /**
   * The authoritative custom-domains adapter. When set, mounts the
   * `/custom-domains` resource that tenant shards call through
   * `createControlPlaneCustomDomainsAdapter`.
   *
   * Pass the Cloudflare adapter (`@authhero/cloudflare`) wrapping the
   * control-plane database: registering a CF-for-SaaS hostname needs account
   * credentials that only exist here, and enforcing "one tenant owns
   * login.acme.com" needs a view across every tenant that only exists here.
   */
  customDomains?: CustomDomainsAdapter;
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

/**
 * Returns a Hono app exposing the privileged proxy control-plane endpoint
 * `GET /hosts/:host`. When `applySyncEvents` is provided, also exposes
 * `POST /sync` for tenant shards to replicate custom_domains / proxy_routes
 * mutations. Mount under `/api/v2/proxy/control-plane`.
 *
 * Authentication is built in: requests must carry a `Bearer` JWT whose `iss`
 * is either the runtime `env.ISSUER` or the host the request actually
 * arrived on (`x-forwarded-host` or the request URL's host). The verifier
 * then fetches `<iss>/.well-known/jwks.json` to validate the signature, so
 * each accepted host must publish its own JWKS at that path. Tokens must
 * also carry the `proxy:resolve_host` scope.
 */
export function createProxyControlPlaneApp(
  options: ProxyControlPlaneOptions,
): Hono<{ Bindings: Bindings }> {
  const app = new Hono<{ Bindings: Bindings }>();

  function authenticateWithScope(requiredScope: string | string[]) {
    return async (c: {
      req: {
        raw: Request;
        header(name: string): string | undefined;
        url: string;
      };
      env: Bindings;
    }): Promise<VerifyControlPlaneTokenResult> =>
      authenticate(c, requiredScope);
  }

  async function authenticate(
    c: {
      req: {
        raw: Request;
        header(name: string): string | undefined;
        url: string;
      };
      env: Bindings;
    },
    requiredScope: string | string[],
  ): Promise<VerifyControlPlaneTokenResult> {
    const token = extractBearerToken(c.req.raw);
    if (!token) return { ok: false, reason: "missing bearer token" };

    // Accept either the canonical ISSUER (legacy callers) or the host the
    // request actually landed on. The latter covers both tenant subdomains
    // (e.g. `sesamy.token.sesamy.com`) and registered custom domains
    // fronted by `@authhero/proxy` (e.g. `login.parcferme.no`) — both
    // collapse to "iss equals the request host" because only authhero can
    // mint tokens signed by a key in that host's JWKS.
    const inboundHost =
      c.req.header("x-forwarded-host") ?? new URL(c.req.url).host;
    const inboundIssuer = `https://${inboundHost}/`;
    const expectedIssuers = Array.from(new Set([c.env.ISSUER, inboundIssuer]));

    return verifyControlPlaneToken({
      token,
      jwksFetch: options.jwksFetch,
      expectedIssuers,
      requiredScope,
    });
  }

  const resolveHandler: Handler<{ Bindings: Bindings }> = async (c) => {
    const result = await authenticate(c, PROXY_RESOLVE_HOST_SCOPE);
    if (!result.ok) {
      console.warn(
        `[proxy/control-plane] authentication failed: ${result.reason}`,
      );
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

  app.get("/hosts/:host", resolveHandler);

  if (options.customDomains) {
    app.route(
      "/custom-domains",
      createCustomDomainsControlPlaneApp({
        customDomains: options.customDomains,
        authenticate: authenticateWithScope(CONTROL_PLANE_CUSTOM_DOMAINS_SCOPE),
      }),
    );
  }

  if (options.applySyncEvents) {
    const applySyncEvents = options.applySyncEvents;
    app.post("/sync", async (c) => {
      // `controlplane:sync` only. `proxy:resolve_host` is a read credential
      // held by the proxy; accepting it here would let a host-resolution token
      // mutate global proxy routes. (Nothing can depend on the old behavior:
      // the receiver required `proxy:resolve_host` while the sender minted
      // `controlplane:sync`, so this endpoint never authenticated anyone.)
      const result = await authenticate(c, CONTROL_PLANE_SYNC_SCOPE);
      if (!result.ok) {
        console.warn(
          `[proxy/control-plane/sync] authentication failed: ${result.reason}`,
        );
        return c.text("Unauthorized", 401, {
          "WWW-Authenticate": "Bearer",
        });
      }

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.text("Invalid JSON", 400);
      }

      const parsed = syncRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(
          { error: "Invalid sync request", details: parsed.error.issues },
          400,
        );
      }

      // A shard may only replicate its own rows. The scope is held by every
      // shard, so without this an event's `tenant_id` would be enough to
      // rewrite another tenant's proxy routes. Fail closed: a token with no
      // tenant binding cannot replicate anything (every legitimate sync token,
      // minted by createServiceTokenCore, carries a tenant_id claim).
      if (
        !result.tenantId ||
        parsed.data.events.some((e) => e.tenant_id !== result.tenantId)
      ) {
        console.warn(
          `[proxy/control-plane/sync] event tenant_id does not match the token (tenant=${result.tenantId ?? "<none>"})`,
        );
        return c.text("Forbidden", 403);
      }

      try {
        await applySyncEvents(parsed.data.events);
        return c.body(null, 204);
      } catch (err) {
        // Retryable errors propagate so the outbox can back off and retry.
        // Non-retryable failures return a structured 500 — the sender's
        // outbox will retry, and a persistent failure surfaces in the
        // body for ops.
        const retryable =
          err !== null &&
          typeof err === "object" &&
          (err as { retryable?: unknown }).retryable === true;
        if (retryable) throw err;
        const e = err instanceof Error ? err : new Error(String(err));
        console.error("[proxy/control-plane/sync] applySyncEvents failed:", e);
        return c.json(
          {
            error: "Failed to apply sync events",
            message: e.message,
            kind: e.name,
            retryable: false,
          },
          500,
        );
      }
    });
  }

  return app;
}

export interface CreateApplySyncEventsOptions {
  proxyRoutes: ProxyRoutesAdapter;
}

/**
 * Build an idempotent `applySyncEvents` implementation backed by a local
 * `ProxyRoutesAdapter`. Handles the three retry shapes the outbox can produce:
 *
 *  - duplicate `created` (retry after the previous succeeded but
 *    `markProcessed` failed) — falls back to `update`.
 *  - `updated` for a row that doesn't exist locally yet (a `created`
 *    delivery is still in flight or lost) — falls back to `create`.
 *  - `deleted` for a row that's already gone — no-op success.
 *
 * Custom domains are not replicated: the control plane is authoritative for
 * them and tenant shards write through it (see
 * `createControlPlaneCustomDomainsAdapter`), so there is no upward sync to
 * apply.
 */
export function createApplySyncEvents(
  options: CreateApplySyncEventsOptions,
): (events: SyncEvent[]) => Promise<void> {
  const { proxyRoutes } = options;

  return async (events) => {
    for (const event of events) {
      await applyProxyRoute(proxyRoutes, event);
    }
  };
}

async function applyProxyRoute(
  adapter: ProxyRoutesAdapter,
  event: Extract<SyncEvent, { entity: "proxy_route" }>,
): Promise<void> {
  if (event.op === "deleted") {
    try {
      await adapter.remove(event.tenant_id, event.aggregate_id);
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
    return;
  }

  if (event.op === "created") {
    try {
      await adapter.create(event.tenant_id, event.payload);
      return;
    } catch (err) {
      if (!isDuplicateError(err)) throw err;
    }
  }

  const updated = await adapter.update(
    event.tenant_id,
    event.aggregate_id,
    event.payload,
  );
  if (!updated) {
    await adapter.create(event.tenant_id, event.payload);
  }
}

function isDuplicateError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("UNIQUE constraint failed") ||
    msg.includes("Duplicate entry") ||
    msg.includes("PRIMARY KEY")
  );
}

function isNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.toLowerCase().includes("not found");
}

export type { CustomDomain, ProxyRoute };
