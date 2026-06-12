import { Context } from "hono";
import {
  CacheAdapter,
  Client,
  ClientWithTenantId,
  Connection,
  DataAdapters,
  ListConnectionsResponse,
  ListHooksResponse,
  ListResourceServersResponse,
  Branding,
  PromptSetting,
  Tenant,
  Theme,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import {
  ClientBundle,
  ClientBundleConfig,
  clientBundleKey,
  loadClientBundle,
} from "./client-bundle";

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Route reads that match the request's (tenant_id, client_id) to a single
 * cached {@link ClientBundle} instead of going entity-by-entity through the
 * downstream cache. Calls with different tenants/clients, or with non-default
 * pagination, fall through to {@link upstream}.
 *
 * The bundle is loaded lazily on the first matching read — `tenant_id` and
 * `client_id` typically come from middleware and route entry, so by the time
 * any bundle-covered method is hit they're set.
 *
 * Pass `upstream` (the layer below this wrapper) so bundle component fetches
 * still benefit from request-scoped dedup / persistent cache / hooks.
 */
export function withClientBundle(
  ctx: Ctx,
  upstream: DataAdapters,
  cache: CacheAdapter,
  options: { config?: ClientBundleConfig } = {},
): DataAdapters {
  let bundlePromise: Promise<ClientBundle> | null = null;
  let bundleTenantId: string | undefined;
  let bundleClientId: string | undefined;

  function scheduleRefresh(p: Promise<unknown>) {
    try {
      ctx.executionCtx.waitUntil(p);
    } catch {
      // executionCtx is not available outside Workers — caller would have
      // had to await the foreground path. With no executionCtx we still want
      // the refresh to fire; promise will be GC'd by the runtime if not held.
      void p;
    }
  }

  function getBundle(): Promise<ClientBundle> | null {
    const tenantId = ctx.var.tenant_id;
    const clientId = ctx.var.client_id;
    if (!tenantId || !clientId) return null;

    // If the request's (tenant_id, client_id) has changed since we last
    // computed the bundle (unusual but possible across redirects within a
    // single Hono invocation), drop the memoized promise and refetch.
    if (
      bundlePromise &&
      (bundleTenantId !== tenantId || bundleClientId !== clientId)
    ) {
      bundlePromise = null;
    }

    if (!bundlePromise) {
      bundleTenantId = tenantId;
      bundleClientId = clientId;
      bundlePromise = loadClientBundle(upstream, cache, tenantId, clientId, {
        ...options,
        scheduleRefresh,
      });
    }
    return bundlePromise;
  }

  return {
    ...upstream,
    tenants: {
      ...upstream.tenants,
      get: async (id: string): Promise<Tenant | null> => {
        if (id === ctx.var.tenant_id) {
          const bundle = await getBundle();
          if (bundle) return bundle.tenant;
        }
        return upstream.tenants.get(id);
      },
    },
    clients: {
      ...upstream.clients,
      get: async (
        tenantId: string,
        clientId: string,
      ): Promise<Client | null> => {
        if (
          tenantId === ctx.var.tenant_id &&
          clientId === ctx.var.client_id
        ) {
          const bundle = await getBundle();
          if (bundle) return bundle.client;
        }
        return upstream.clients.get(tenantId, clientId);
      },
      getByClientId: async (
        clientId: string,
      ): Promise<ClientWithTenantId | null> => {
        if (clientId === ctx.var.client_id && ctx.var.tenant_id) {
          const bundle = await getBundle();
          if (bundle && bundle.client) {
            return { ...bundle.client, tenant_id: ctx.var.tenant_id };
          }
        }
        return upstream.clients.getByClientId(clientId);
      },
    },
    connections: {
      ...upstream.connections,
      list: async (
        tenantId: string,
        params?: unknown,
      ): Promise<ListConnectionsResponse> => {
        if (tenantId === ctx.var.tenant_id && !params) {
          const bundle = await getBundle();
          if (bundle) return bundle.connections;
        }
        return upstream.connections.list(tenantId, params as never);
      },
    },
    clientConnections: {
      ...upstream.clientConnections,
      listByClient: async (
        tenantId: string,
        clientId: string,
      ): Promise<Connection[]> => {
        if (
          tenantId === ctx.var.tenant_id &&
          clientId === ctx.var.client_id
        ) {
          const bundle = await getBundle();
          if (bundle) return bundle.clientConnections;
        }
        return upstream.clientConnections.listByClient(tenantId, clientId);
      },
    },
    branding: {
      ...upstream.branding,
      get: async (tenantId: string): Promise<Branding | null> => {
        if (tenantId === ctx.var.tenant_id) {
          const bundle = await getBundle();
          if (bundle) return bundle.branding;
        }
        return upstream.branding.get(tenantId);
      },
    },
    resourceServers: {
      ...upstream.resourceServers,
      list: async (
        tenantId: string,
        params?: unknown,
      ): Promise<ListResourceServersResponse> => {
        if (tenantId === ctx.var.tenant_id && !params) {
          const bundle = await getBundle();
          if (bundle) return bundle.resourceServers;
        }
        return upstream.resourceServers.list(tenantId, params as never);
      },
    },
    promptSettings: {
      ...upstream.promptSettings,
      get: async (tenantId: string): Promise<PromptSetting> => {
        if (tenantId === ctx.var.tenant_id) {
          const bundle = await getBundle();
          // promptSettings.get's interface returns PromptSetting, not nullable;
          // when the bundle stored null (no settings configured) fall through
          // to the upstream so it can return whatever empty shape it provides.
          if (bundle && bundle.promptSettings) return bundle.promptSettings;
        }
        return upstream.promptSettings.get(tenantId);
      },
    },
    themes: {
      ...upstream.themes,
      get: async (
        tenantId: string,
        themeId: string,
      ): Promise<Theme | null> => {
        // Only the "default" theme is bundled — that's what initJSXRoute and
        // error pages fetch on every UI render. Other themeIds are rare and
        // fall through.
        if (tenantId === ctx.var.tenant_id && themeId === "default") {
          const bundle = await getBundle();
          if (bundle) return bundle.defaultTheme;
        }
        return upstream.themes.get(tenantId, themeId);
      },
    },
    hooks: {
      ...upstream.hooks,
      list: async (
        tenantId: string,
        params?: unknown,
      ): Promise<ListHooksResponse> => {
        if (tenantId === ctx.var.tenant_id && !params) {
          const bundle = await getBundle();
          if (bundle) return bundle.hooks;
        }
        return upstream.hooks.list(tenantId, params as never);
      },
    },
  };
}

/**
 * Best-effort purge of a (tenant_id, client_id) bundle entry from cache.
 * On Cloudflare this only affects the local edge; entries on other colos
 * will expire via TTL.
 */
export async function purgeClientBundle(
  cache: CacheAdapter,
  tenantId: string,
  clientId: string,
  keyPrefix?: string,
): Promise<void> {
  try {
    await cache.delete(clientBundleKey(tenantId, clientId, keyPrefix));
  } catch {
    // Swallow — TTL still bounds staleness.
  }
}
