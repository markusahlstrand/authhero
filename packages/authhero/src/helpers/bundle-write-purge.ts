import { CacheAdapter, DataAdapters } from "@authhero/adapter-interfaces";
import { clientBundleKey } from "./client-bundle";

/**
 * Wraps a {@link DataAdapters} so that writes to bundle-covered entities
 * purge the corresponding `client-bundle:{tenant_id}:{client_id}` cache
 * entry — best-effort and local-edge only on Cloudflare's Cache API.
 *
 * Two write shapes:
 * 1. Client-scoped writes (args = [tenant_id, client_id, ...]): purge the
 *    exact bundle key. Affects exactly one bundle.
 * 2. Tenant-scoped writes (args = [tenant_id, ...]): attempt a prefix delete
 *    of `client-bundle:{tenant_id}:`. This is a no-op on Cloudflare Cache
 *    (which can't enumerate keys) but works on the in-memory adapter and
 *    on Redis-backed adapters. Tenant-scoped staleness is otherwise bounded
 *    by the bundle TTL.
 */
export function addBundleWritePurge(
  data: DataAdapters,
  cache: CacheAdapter,
  keyPrefix?: string,
): DataAdapters {
  const purgeClient = (tenantId: string, clientId: string) =>
    cache.delete(clientBundleKey(tenantId, clientId, keyPrefix)).catch(() => {});

  const purgeTenant = (tenantId: string) => {
    const prefix = `${keyPrefix ?? "client-bundle"}:${tenantId}:`;
    return cache.deleteByPrefix(prefix).catch(() => 0);
  };

  return {
    ...data,
    tenants: {
      ...data.tenants,
      update: async (id, params) => {
        const result = await data.tenants.update(id, params);
        await purgeTenant(id);
        return result;
      },
      remove: async (id) => {
        const result = await data.tenants.remove(id);
        await purgeTenant(id);
        return result;
      },
    },
    clients: {
      ...data.clients,
      update: async (tenantId, clientId, params) => {
        const result = await data.clients.update(tenantId, clientId, params);
        await purgeClient(tenantId, clientId);
        return result;
      },
      remove: async (tenantId, clientId) => {
        const result = await data.clients.remove(tenantId, clientId);
        await purgeClient(tenantId, clientId);
        return result;
      },
    },
    clientConnections: {
      ...data.clientConnections,
      updateByClient: async (tenantId, clientId, connectionIds) => {
        const result = await data.clientConnections.updateByClient(
          tenantId,
          clientId,
          connectionIds,
        );
        await purgeClient(tenantId, clientId);
        return result;
      },
      addClientToConnection: async (tenantId, connectionId, clientId) => {
        const result = await data.clientConnections.addClientToConnection(
          tenantId,
          connectionId,
          clientId,
        );
        await purgeClient(tenantId, clientId);
        return result;
      },
      removeClientFromConnection: async (tenantId, connectionId, clientId) => {
        const result = await data.clientConnections.removeClientFromConnection(
          tenantId,
          connectionId,
          clientId,
        );
        await purgeClient(tenantId, clientId);
        return result;
      },
    },
    connections: {
      ...data.connections,
      update: async (tenantId, connId, params) => {
        const result = await data.connections.update(tenantId, connId, params);
        await purgeTenant(tenantId);
        return result;
      },
      remove: async (tenantId, connId) => {
        const result = await data.connections.remove(tenantId, connId);
        await purgeTenant(tenantId);
        return result;
      },
    },
    branding: {
      ...data.branding,
      set: async (tenantId, branding) => {
        const result = await data.branding.set(tenantId, branding);
        await purgeTenant(tenantId);
        return result;
      },
    },
    resourceServers: {
      ...data.resourceServers,
      update: async (tenantId, id, params) => {
        const result = await data.resourceServers.update(tenantId, id, params);
        await purgeTenant(tenantId);
        return result;
      },
      remove: async (tenantId, id) => {
        const result = await data.resourceServers.remove(tenantId, id);
        await purgeTenant(tenantId);
        return result;
      },
    },
    promptSettings: {
      ...data.promptSettings,
      set: async (tenantId, settings) => {
        const result = await data.promptSettings.set(tenantId, settings);
        await purgeTenant(tenantId);
        return result;
      },
    },
    hooks: {
      ...data.hooks,
      update: async (tenantId, id, params) => {
        const result = await data.hooks.update(tenantId, id, params);
        await purgeTenant(tenantId);
        return result;
      },
      remove: async (tenantId, id) => {
        const result = await data.hooks.remove(tenantId, id);
        await purgeTenant(tenantId);
        return result;
      },
    },
  };
}
