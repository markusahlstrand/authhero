import { describe, it, expect, beforeEach } from "vitest";
import { decodeCursor } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";

// Checkpoint (from/take) pagination for connections, backing
// GET /api/v2/connections. Fixed created_at desc order with an id tiebreaker,
// and no offset envelope.
describe("connections keyset pagination (from/take)", () => {
  let data: ReturnType<typeof getTestServer>["data"];
  const tenantId = "t1";

  beforeEach(async () => {
    const server = getTestServer();
    data = server.data;

    await data.tenants.create({ id: tenantId, name: "Tenant 1" });

    // The adapter stamps created_at from a single ISO clock, so these rows
    // share timestamps — exactly where the id tiebreaker has to carry the
    // ordering.
    for (let i = 0; i < 25; i++) {
      await data.connections.create(tenantId, {
        id: `con-${i.toString().padStart(2, "0")}`,
        name: `connection-${i}`,
        strategy: "mock-strategy",
        options: {},
      });
    }
  });

  it("walks every connection exactly once across pages via next", async () => {
    const seen = new Set<string>();
    let from: string | undefined;
    let pages = 0;

    for (;;) {
      const res = await data.connections.list(tenantId, { take: 10, from });
      pages++;
      expect(res.connections.length).toBeLessThanOrEqual(10);
      for (const connection of res.connections) {
        expect(seen.has(connection.id)).toBe(false); // no duplicates
        seen.add(connection.id);
      }
      if (!res.next) break;
      from = res.next;
      if (pages > 10) throw new Error("cursor walk did not terminate");
    }

    expect(seen.size).toBe(25);
    expect(pages).toBe(3); // 10 + 10 + 5
  });

  it("omits next on the final page", async () => {
    const res = await data.connections.list(tenantId, { take: 50 });
    expect(res.connections).toHaveLength(25);
    expect(res.next).toBeUndefined();
  });

  it("emits an opaque, decodable cursor (not a numeric offset)", async () => {
    const res = await data.connections.list(tenantId, { take: 10 });
    expect(res.next).toBeDefined();
    expect(res.next).not.toBe("10");
    const decoded = decodeCursor(res.next!);
    expect(decoded).not.toBeNull();
    expect(typeof decoded!.i).toBe("string");
  });

  it("is stable when a connection is inserted mid-walk", async () => {
    const page1 = await data.connections.list(tenantId, { take: 10 });

    await data.connections.create(tenantId, {
      id: "con-inserted",
      name: "connection-inserted",
      strategy: "mock-strategy",
      options: {},
    });

    const page1Ids = new Set(page1.connections.map((c) => c.id));
    const page2 = await data.connections.list(tenantId, {
      take: 10,
      from: page1.next,
    });
    for (const connection of page2.connections) {
      expect(page1Ids.has(connection.id)).toBe(false);
    }
  });

  it("stays inside the requesting tenant", async () => {
    await data.tenants.create({ id: "t2", name: "Tenant 2" });
    await data.connections.create("t2", {
      id: "con-foreign",
      name: "foreign",
      strategy: "mock-strategy",
      options: {},
    });

    const seen = new Set<string>();
    let from: string | undefined;
    for (;;) {
      const res = await data.connections.list(tenantId, { take: 10, from });
      res.connections.forEach((c) => seen.add(c.id));
      if (!res.next) break;
      from = res.next;
    }
    expect(seen.has("con-foreign")).toBe(false);
    expect(seen.size).toBe(25);
  });

  it("leaves the offset mode untouched", async () => {
    const offset = await data.connections.list(tenantId, {
      page: 0,
      per_page: 10,
      include_totals: true,
    });
    expect(offset.connections).toHaveLength(10);
    expect(offset.length).toBe(25);
    expect(offset.limit).toBe(10);
    expect(offset.next).toBeUndefined();
  });
});
