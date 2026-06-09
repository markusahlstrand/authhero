import { Hono, type Handler } from "hono";
import type { ResolvedHost } from "@authhero/proxy";
import {
  CustomDomain,
  CustomDomainInsert,
  customDomainSchema,
  CustomDomainsAdapter,
  ProxyRoute,
  proxyRouteSchema,
  ProxyRoutesAdapter,
} from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";
import { SyncEvent } from "../../helpers/control-plane-sync-events";
import { Bindings } from "../../types";
import {
  PROXY_RESOLVE_HOST_SCOPE,
  verifyControlPlaneToken,
} from "./verify";

const syncEventSchema = z.discriminatedUnion("entity", [
  z.object({
    event_id: z.string(),
    tenant_id: z.string(),
    entity: z.literal("custom_domain"),
    op: z.enum(["created", "updated", "deleted"]),
    aggregate_id: z.string(),
    payload: customDomainSchema,
    occurred_at: z.string(),
  }),
  z.object({
    event_id: z.string(),
    tenant_id: z.string(),
    entity: z.literal("proxy_route"),
    op: z.enum(["created", "updated", "deleted"]),
    aggregate_id: z.string(),
    payload: proxyRouteSchema,
    occurred_at: z.string(),
  }),
]);

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
   * `createDefaultApplySyncEvents` wires this to a local data adapter with
   * idempotent semantics.
   */
  applySyncEvents?: (events: SyncEvent[]) => Promise<void>;
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

  async function authenticate(c: {
    req: { raw: Request; header(name: string): string | undefined; url: string };
    env: Bindings;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
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
    const expectedIssuers = Array.from(
      new Set([c.env.ISSUER, inboundIssuer]),
    );

    return verifyControlPlaneToken({
      token,
      jwksFetch: options.jwksFetch,
      expectedIssuers,
      requiredScope: PROXY_RESOLVE_HOST_SCOPE,
    });
  }

  const resolveHandler: Handler<{ Bindings: Bindings }> = async (c) => {
    const result = await authenticate(c);
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

  if (options.applySyncEvents) {
    const applySyncEvents = options.applySyncEvents;
    app.post("/sync", async (c) => {
      const result = await authenticate(c);
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
        console.error(
          "[proxy/control-plane/sync] applySyncEvents failed:",
          e,
        );
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
  customDomains: CustomDomainsAdapter;
  proxyRoutes?: ProxyRoutesAdapter;
}

/**
 * Build an idempotent `applySyncEvents` implementation backed by a local
 * `CustomDomainsAdapter` / `ProxyRoutesAdapter`. Handles the three retry
 * shapes the outbox can produce:
 *
 *  - duplicate `created` (retry after the previous succeeded but
 *    `markProcessed` failed) — falls back to `update`.
 *  - `updated` for a row that doesn't exist locally yet (a `created`
 *    delivery is still in flight or lost) — falls back to `create`.
 *  - `deleted` for a row that's already gone — no-op success.
 */
export function createApplySyncEvents(
  options: CreateApplySyncEventsOptions,
): (events: SyncEvent[]) => Promise<void> {
  const { customDomains, proxyRoutes } = options;

  async function applyOne(event: SyncEvent): Promise<void> {
    if (event.entity === "custom_domain") {
      await applyCustomDomain(customDomains, event);
      return;
    }
    if (!proxyRoutes) {
      throw new Error(
        `proxy_route sync event received but no proxyRoutes adapter is configured`,
      );
    }
    await applyProxyRoute(proxyRoutes, event);
  }

  return async (events) => {
    for (const event of events) {
      await applyOne(event);
    }
  };
}

async function applyCustomDomain(
  adapter: CustomDomainsAdapter,
  event: Extract<SyncEvent, { entity: "custom_domain" }>,
): Promise<void> {
  if (event.op === "deleted") {
    try {
      await adapter.remove(event.tenant_id, event.aggregate_id);
    } catch (err) {
      if (!isNotFoundError(err)) throw err;
    }
    return;
  }

  const insertPayload = toCustomDomainInsert(event.payload);

  if (event.op === "created") {
    try {
      await adapter.create(event.tenant_id, insertPayload);
      return;
    } catch (err) {
      if (!isDuplicateError(err)) throw err;
      // Retry of a delivery that already succeeded — fall through to update.
    }
  }

  const updated = await adapter.update(
    event.tenant_id,
    event.aggregate_id,
    event.payload,
  );
  if (!updated) {
    // Row missing locally (the `created` event hasn't arrived yet, or was
    // lost). Create it now so the local state matches the source.
    await adapter.create(event.tenant_id, insertPayload);
  }
}

/**
 * `CustomDomain` widens `tls_policy` to `string` (to accommodate legacy DB
 * rows), but `CustomDomainInsert` keeps it as the literal `"recommended"`.
 * Normalize at the receiver boundary so the insert is type-safe.
 */
function toCustomDomainInsert(payload: CustomDomain): CustomDomainInsert {
  const { tls_policy, ...rest } = payload;
  return {
    ...rest,
    tls_policy: tls_policy === "recommended" ? "recommended" : undefined,
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
