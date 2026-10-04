import { describe, expect, it, beforeEach } from "vitest";
import { decodeCursor, encodeCursor } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";

// Checkpoint (from/take) pagination for roles, backing GET /api/v2/roles.
// Fixed created_at desc order with an id tiebreaker. The mid-walk insert case
// lives in crud.spec.ts.
describe("roles keyset pagination (from/take)", () => {
  let data: Awaited<ReturnType<typeof getTestServer>>["data"];
  const tenantId = "tenantId";

  beforeEach(async () => {
    const server = await getTestServer();
    data = server.data;
    for (let i = 0; i < 25; i++) {
      await data.roles.create(tenantId, { name: `role-${i}` });
    }
  });

  it("walks every role exactly once across pages via next", async () => {
    const seen = new Set<string>();
    let from: string | undefined;
    let pages = 0;
    for (;;) {
      const res = await data.roles.list(tenantId, { take: 10, from });
      pages++;
      for (const role of res.roles) {
        expect(seen.has(role.id)).toBe(false);
        seen.add(role.id);
      }
      if (!res.next) break;
      from = res.next;
      if (pages > 10) throw new Error("cursor walk did not terminate");
    }
    expect(seen.size).toBe(25);
    expect(pages).toBe(3);
  });

  it("emits an opaque, decodable cursor (not a numeric offset)", async () => {
    const res = await data.roles.list(tenantId, { take: 10 });
    expect(res.next).toBeDefined();
    expect(res.next).not.toBe("10");
    expect(decodeCursor(res.next!)).not.toBeNull();
  });

  it("rejects a cursor minted under a different sort", async () => {
    const page1 = await data.roles.list(tenantId, { take: 10 });
    const foreign = encodeCursor({
      ...decodeCursor(page1.next!)!,
      k: "name:asc",
    });
    await expect(
      data.roles.list(tenantId, { take: 10, from: foreign }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("leaves the offset mode untouched", async () => {
    const offset = await data.roles.list(tenantId, {
      page: 2,
      per_page: 10,
      include_totals: true,
    });
    expect(offset.roles).toHaveLength(5);
    expect(offset.length).toBe(25);
    expect(offset.next).toBeUndefined();
  });
});
