import { describe, it, expect, beforeEach } from "vitest";
import { decodeCursor } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";

// Checkpoint (from/take) pagination for resource servers, backing
// GET /api/v2/resource-servers. Fixed created_at desc order with an id
// tiebreaker, and no offset envelope.
describe("resource servers keyset pagination (from/take)", () => {
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
      await data.resourceServers.create(tenantId, {
        id: `rs-${i.toString().padStart(2, "0")}`,
        name: `api${i}`,
        identifier: `https://api-${i}.example.com`,
        scopes: [],
      });
    }
  });

  it("walks every resource server exactly once across pages via next", async () => {
    const seen = new Set<string>();
    let from: string | undefined;
    let pages = 0;

    for (;;) {
      const res = await data.resourceServers.list(tenantId, { take: 10, from });
      pages++;
      expect(res.resource_servers.length).toBeLessThanOrEqual(10);
      for (const resourceServer of res.resource_servers) {
        expect(seen.has(resourceServer.id!)).toBe(false); // no duplicates
        seen.add(resourceServer.id!);
      }
      if (!res.next) break;
      from = res.next;
      if (pages > 10) throw new Error("cursor walk did not terminate");
    }

    expect(seen.size).toBe(25);
    expect(pages).toBe(3); // 10 + 10 + 5
  });

  it("omits next on the final page", async () => {
    const res = await data.resourceServers.list(tenantId, { take: 50 });
    expect(res.resource_servers).toHaveLength(25);
    expect(res.next).toBeUndefined();
  });

  it("emits an opaque, decodable cursor (not a numeric offset)", async () => {
    const res = await data.resourceServers.list(tenantId, { take: 10 });
    expect(res.next).toBeDefined();
    expect(res.next).not.toBe("10");
    const decoded = decodeCursor(res.next!);
    expect(decoded).not.toBeNull();
    expect(typeof decoded!.i).toBe("string");
  });

  it("is stable when a resource server is inserted mid-walk", async () => {
    const page1 = await data.resourceServers.list(tenantId, { take: 10 });

    await data.resourceServers.create(tenantId, {
      id: "rs-inserted",
      name: "API inserted",
      identifier: "https://api-inserted.example.com",
      scopes: [],
    });

    const page1Ids = new Set(page1.resource_servers.map((rs) => rs.id));
    const page2 = await data.resourceServers.list(tenantId, {
      take: 10,
      from: page1.next,
    });
    for (const resourceServer of page2.resource_servers) {
      expect(page1Ids.has(resourceServer.id)).toBe(false);
    }
  });

  it("applies the q filter in checkpoint mode", async () => {
    const seen = new Set<string>();
    let from: string | undefined;
    for (;;) {
      const res = await data.resourceServers.list(tenantId, {
        take: 3,
        from,
        q: "name:api1",
      });
      res.resource_servers.forEach((rs) => seen.add(rs.id!));
      if (!res.next) break;
      from = res.next;
    }
    // "api1" and "api10".."api19" match as substrings.
    expect(seen.size).toBe(11);
    expect(seen.has("rs-01")).toBe(true);
    expect(seen.has("rs-02")).toBe(false);
  });

  it("stays inside the requesting tenant", async () => {
    await data.tenants.create({ id: "t2", name: "Tenant 2" });
    await data.resourceServers.create("t2", {
      id: "rs-foreign",
      name: "Foreign API",
      identifier: "https://foreign.example.com",
      scopes: [],
    });

    const seen = new Set<string>();
    let from: string | undefined;
    for (;;) {
      const res = await data.resourceServers.list(tenantId, { take: 10, from });
      res.resource_servers.forEach((rs) => seen.add(rs.id!));
      if (!res.next) break;
      from = res.next;
    }
    expect(seen.has("rs-foreign")).toBe(false);
    expect(seen.size).toBe(25);
  });

  it("leaves the offset mode untouched", async () => {
    const offset = await data.resourceServers.list(tenantId, {
      page: 0,
      per_page: 10,
      include_totals: true,
    });
    expect(offset.resource_servers).toHaveLength(10);
    expect(offset.length).toBe(25);
    expect(offset.limit).toBe(10);
    expect(offset.next).toBeUndefined();
  });
});
