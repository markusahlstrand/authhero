import { describe, expect, it } from "vitest";
import { addBundleWritePurge } from "../../src/helpers/bundle-write-purge";
import { clientBundleKey } from "../../src/helpers/client-bundle";
import { CacheAdapter, DataAdapters } from "@authhero/adapter-interfaces";

function makeCache(): CacheAdapter & {
  store: Map<string, unknown>;
  deleteByPrefixCalls: string[];
} {
  const store = new Map<string, unknown>();
  const deleteByPrefixCalls: string[] = [];
  return {
    store,
    deleteByPrefixCalls,
    async get<T = unknown>(key: string) {
      return (store.get(key) as T) ?? null;
    },
    async set<T = unknown>(key: string, value: T) {
      store.set(key, value);
    },
    async delete(key: string) {
      return store.delete(key);
    },
    async deleteByPrefix(prefix: string) {
      deleteByPrefixCalls.push(prefix);
      let count = 0;
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) {
          store.delete(k);
          count++;
        }
      }
      return count;
    },
    async clear() {
      store.clear();
    },
  };
}

function makeData() {
  const calls: string[] = [];
  const data = {
    clients: {
      update: async (t: string, c: string) => {
        calls.push(`clients.update:${t}:${c}`);
        return true;
      },
      remove: async (t: string, c: string) => {
        calls.push(`clients.remove:${t}:${c}`);
        return true;
      },
    },
    clientConnections: {
      updateByClient: async (t: string, c: string) => {
        calls.push(`clientConnections.updateByClient:${t}:${c}`);
        return true;
      },
      addClientToConnection: async (t: string, _conn: string, c: string) => {
        calls.push(`clientConnections.addClientToConnection:${t}:${c}`);
        return true;
      },
      removeClientFromConnection: async (
        t: string,
        _conn: string,
        c: string,
      ) => {
        calls.push(`clientConnections.removeClientFromConnection:${t}:${c}`);
        return true;
      },
    },
    connections: {
      update: async (t: string) => {
        calls.push(`connections.update:${t}`);
        return true;
      },
      remove: async (t: string) => {
        calls.push(`connections.remove:${t}`);
        return true;
      },
    },
    branding: {
      set: async (t: string) => {
        calls.push(`branding.set:${t}`);
      },
    },
    tenants: {
      update: async (t: string) => {
        calls.push(`tenants.update:${t}`);
      },
      remove: async (t: string) => {
        calls.push(`tenants.remove:${t}`);
        return true;
      },
    },
    hooks: {
      update: async (t: string) => {
        calls.push(`hooks.update:${t}`);
        return true;
      },
      remove: async (t: string) => {
        calls.push(`hooks.remove:${t}`);
        return true;
      },
    },
    resourceServers: {
      update: async (t: string) => {
        calls.push(`resourceServers.update:${t}`);
        return true;
      },
      remove: async (t: string) => {
        calls.push(`resourceServers.remove:${t}`);
        return true;
      },
    },
    promptSettings: {
      set: async (t: string) => {
        calls.push(`promptSettings.set:${t}`);
      },
    },
  } as unknown as DataAdapters;
  return { data, calls };
}

describe("addBundleWritePurge", () => {
  it("purges the exact bundle key on clients.update", async () => {
    const cache = makeCache();
    cache.store.set(clientBundleKey("t1", "c1"), { value: "stale" });
    cache.store.set(clientBundleKey("t1", "c2"), { value: "other" });

    const { data, calls } = makeData();
    const wrapped = addBundleWritePurge(data, cache);
    await wrapped.clients.update("t1", "c1", {});

    expect(calls).toContain("clients.update:t1:c1");
    expect(cache.store.has(clientBundleKey("t1", "c1"))).toBe(false);
    expect(cache.store.has(clientBundleKey("t1", "c2"))).toBe(true);
  });

  it("purges the exact bundle key on clients.remove", async () => {
    const cache = makeCache();
    cache.store.set(clientBundleKey("t1", "c1"), { value: "x" });
    const { data } = makeData();
    const wrapped = addBundleWritePurge(data, cache);
    await wrapped.clients.remove("t1", "c1");
    expect(cache.store.has(clientBundleKey("t1", "c1"))).toBe(false);
  });

  it("purges by tenant prefix on connections.update (tenant-scoped)", async () => {
    const cache = makeCache();
    cache.store.set(clientBundleKey("t1", "c1"), { value: "x" });
    cache.store.set(clientBundleKey("t1", "c2"), { value: "y" });
    cache.store.set(clientBundleKey("t2", "c1"), { value: "z" });

    const { data } = makeData();
    const wrapped = addBundleWritePurge(data, cache);
    await wrapped.connections.update("t1", "conn1", {});

    expect(cache.deleteByPrefixCalls).toContain("client-bundle:t1:");
    expect(cache.store.has(clientBundleKey("t1", "c1"))).toBe(false);
    expect(cache.store.has(clientBundleKey("t1", "c2"))).toBe(false);
    expect(cache.store.has(clientBundleKey("t2", "c1"))).toBe(true);
  });

  it("purges exact key on clientConnections.updateByClient", async () => {
    const cache = makeCache();
    cache.store.set(clientBundleKey("t1", "c1"), { value: "x" });
    const { data } = makeData();
    const wrapped = addBundleWritePurge(data, cache);
    await wrapped.clientConnections.updateByClient("t1", "c1", ["conn1"]);
    expect(cache.store.has(clientBundleKey("t1", "c1"))).toBe(false);
  });

  it("purges tenant prefix on branding.set", async () => {
    const cache = makeCache();
    cache.store.set(clientBundleKey("t1", "c1"), { value: "x" });
    const { data } = makeData();
    const wrapped = addBundleWritePurge(data, cache);
    await wrapped.branding.set("t1", {} as never);
    expect(cache.store.has(clientBundleKey("t1", "c1"))).toBe(false);
  });

  it("swallows purge failures and still returns the write result", async () => {
    const cache = makeCache();
    cache.delete = async () => {
      throw new Error("cache offline");
    };
    const { data } = makeData();
    const wrapped = addBundleWritePurge(data, cache);
    await expect(wrapped.clients.update("t1", "c1", {})).resolves.toBe(true);
  });
});
