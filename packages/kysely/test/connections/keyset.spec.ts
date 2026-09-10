import { describe, expect, it, beforeEach } from "vitest";
import { decodeCursor } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";

// Checkpoint (from/take) pagination for connections, backing
// GET /api/v2/connections. Fixed created_at desc order with an id tiebreaker.
describe("connections keyset pagination (from/take)", () => {
  let data: Awaited<ReturnType<typeof getTestServer>>["data"];
  const tenantId = "tenantId";

  beforeEach(async () => {
    const server = await getTestServer();
    data = server.data;

    await data.tenants.create({
      id: tenantId,
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // created_at has second resolution, so most of these rows share a
    // timestamp — exactly the case the id tiebreaker has to carry.
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
    await data.tenants.create({
      id: "otherTenant",
      friendly_name: "Other Tenant",
      audience: "https://other.example.com",
      sender_email: "login@other.example.com",
      sender_name: "Other",
    });
    await data.connections.create("otherTenant", {
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
    // No cursor is minted for offset requests.
    expect(offset.next).toBeUndefined();
  });
});
