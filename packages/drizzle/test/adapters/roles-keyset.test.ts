import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";

describe("roles checkpoint pagination", () => {
  it("walks roles once and keeps offset totals", async () => {
    const { data } = getTestServer();
    const tenantId = "roles-cursor-tenant";
    await data.tenants.create({ id: tenantId, name: "Roles Tenant" });
    for (let i = 0; i < 7; i++) {
      await data.roles.create(tenantId, { name: `match-${i}` });
    }
    await data.roles.create(tenantId, { name: "other" });

    const seen = new Set<string>();
    let from: string | undefined;
    let pages = 0;
    do {
      const result = await data.roles.list(tenantId, {
        take: 3,
        from,
      });
      for (const role of result.roles) {
        expect(seen.has(role.id)).toBe(false);
        seen.add(role.id);
      }
      from = result.next;
      if (++pages > 4) throw new Error("role cursor walk did not terminate");
    } while (from);
    expect(seen.size).toBe(8);
    expect(pages).toBe(3);

    const offset = await data.roles.list(tenantId, {
      page: 1,
      per_page: 3,
      include_totals: true,
    });
    expect(offset.roles).toHaveLength(3);
    expect(offset.start).toBe(3);
    expect(offset.limit).toBe(3);
    expect(offset.length).toBe(8);
    expect(offset.next).toBeUndefined();
  });

  it("emits an opaque cursor that is stable under a mid-walk insert", async () => {
    const { data } = getTestServer();
    const tenantId = "roles-cursor-insert";
    await data.tenants.create({ id: tenantId, name: "Roles Tenant" });
    for (let i = 0; i < 7; i++) {
      await data.roles.create(tenantId, { name: `role-${i}` });
    }

    const first = await data.roles.list(tenantId, { take: 3 });
    expect(first.next).toBeDefined();
    expect(first.next).not.toBe("3");
    expect(decodeCursor(first.next!)).not.toBeNull();

    await data.roles.create(tenantId, { name: "new-role" });

    const seen = new Set(first.roles.map((role) => role.id));
    let from = first.next;
    while (from) {
      const result = await data.roles.list(tenantId, { take: 3, from });
      for (const role of result.roles) {
        expect(seen.has(role.id)).toBe(false);
        seen.add(role.id);
      }
      from = result.next;
    }
    expect(seen.size).toBeGreaterThanOrEqual(7);
  });

  it("rejects a cursor minted under a different sort", async () => {
    const { data } = getTestServer();
    const tenantId = "roles-cursor-sort";
    await data.tenants.create({ id: tenantId, name: "Roles Tenant" });
    for (let i = 0; i < 4; i++) {
      await data.roles.create(tenantId, { name: `role-${i}` });
    }
    const first = await data.roles.list(tenantId, { take: 2 });
    const foreign = encodeCursor({
      ...decodeCursor(first.next!)!,
      k: "name:asc",
    });
    await expect(
      data.roles.list(tenantId, { take: 2, from: foreign }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
