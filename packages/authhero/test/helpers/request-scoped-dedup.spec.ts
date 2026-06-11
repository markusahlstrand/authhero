import { describe, expect, it } from "vitest";
import { addRequestScopedDedup } from "../../src/helpers/request-scoped-dedup";
import { DataAdapters } from "@authhero/adapter-interfaces";

function makeAdapter() {
  let getCalls = 0;
  let listCalls = 0;
  let updateCalls = 0;
  let sessionsGetCalls = 0;
  const data = {
    clients: {
      get: async (_tenantId: string, clientId: string) => {
        getCalls++;
        return { client_id: clientId };
      },
      list: async (_tenantId: string) => {
        listCalls++;
        return { clients: [] };
      },
      update: async (_tenantId: string, clientId: string) => {
        updateCalls++;
        return { client_id: clientId };
      },
    },
    tenants: {
      get: async (id: string) => ({ id }),
    },
    sessions: {
      get: async (_tenantId: string, sessionId: string) => {
        sessionsGetCalls++;
        return { id: sessionId };
      },
    },
  } as unknown as DataAdapters;
  return {
    data,
    getCalls: () => getCalls,
    listCalls: () => listCalls,
    updateCalls: () => updateCalls,
    sessionsGetCalls: () => sessionsGetCalls,
  };
}

const CLIENT_ENTITIES = ["clients", "tenants"];

describe("addRequestScopedDedup", () => {
  it("memoizes repeat reads with identical args", async () => {
    const { data, getCalls } = makeAdapter();
    const deduped = addRequestScopedDedup(data, {
      dedupEntities: CLIENT_ENTITIES,
    });

    const a = await deduped.clients.get("t1", "c1");
    const b = await deduped.clients.get("t1", "c1");

    expect(a).toEqual({ client_id: "c1" });
    expect(b).toEqual({ client_id: "c1" });
    expect(getCalls()).toBe(1);
  });

  it("does NOT memoize across different args", async () => {
    const { data, getCalls } = makeAdapter();
    const deduped = addRequestScopedDedup(data, {
      dedupEntities: CLIENT_ENTITIES,
    });

    await deduped.clients.get("t1", "c1");
    await deduped.clients.get("t1", "c2");

    expect(getCalls()).toBe(2);
  });

  it("collapses concurrent in-flight reads", async () => {
    const { data, getCalls } = makeAdapter();
    const deduped = addRequestScopedDedup(data, {
      dedupEntities: CLIENT_ENTITIES,
    });

    const [a, b] = await Promise.all([
      deduped.clients.get("t1", "c1"),
      deduped.clients.get("t1", "c1"),
    ]);

    expect(a).toEqual({ client_id: "c1" });
    expect(b).toEqual({ client_id: "c1" });
    expect(getCalls()).toBe(1);
  });

  it("invalidates the entity's entries on write", async () => {
    const { data, getCalls, updateCalls } = makeAdapter();
    const deduped = addRequestScopedDedup(data, {
      dedupEntities: CLIENT_ENTITIES,
    });

    await deduped.clients.get("t1", "c1");
    await deduped.clients.update("t1", "c1");
    await deduped.clients.get("t1", "c1");

    expect(getCalls()).toBe(2);
    expect(updateCalls()).toBe(1);
  });

  it("does NOT memoize entities outside of dedupEntities", async () => {
    const { data, sessionsGetCalls } = makeAdapter();
    const deduped = addRequestScopedDedup(data, {
      dedupEntities: CLIENT_ENTITIES, // sessions intentionally omitted
    });

    await deduped.sessions.get("t1", "s1");
    await deduped.sessions.get("t1", "s1");

    // Each call hits the underlying adapter — sessions are mutated via
    // transactions, so deduping them would risk serving stale data.
    expect(sessionsGetCalls()).toBe(2);
  });

  it("does not cache rejected reads", async () => {
    let calls = 0;
    let shouldThrow = true;
    const data = {
      clients: {
        get: async () => {
          calls++;
          if (shouldThrow) throw new Error("transient");
          return { client_id: "c1" };
        },
      },
    } as unknown as DataAdapters;
    const deduped = addRequestScopedDedup(data, {
      dedupEntities: ["clients"],
    });

    await expect(deduped.clients.get("t1", "c1")).rejects.toThrow("transient");
    shouldThrow = false;
    const result = await deduped.clients.get("t1", "c1");

    expect(result).toEqual({ client_id: "c1" });
    expect(calls).toBe(2);
  });

  it("dies with the Map — separate Maps share no state", async () => {
    const { data, getCalls } = makeAdapter();

    const req1 = addRequestScopedDedup(data, {
      dedupEntities: CLIENT_ENTITIES,
      dedup: new Map(),
    });
    const req2 = addRequestScopedDedup(data, {
      dedupEntities: CLIENT_ENTITIES,
      dedup: new Map(),
    });

    await req1.clients.get("t1", "c1");
    await req2.clients.get("t1", "c1");

    expect(getCalls()).toBe(2);
  });
});
