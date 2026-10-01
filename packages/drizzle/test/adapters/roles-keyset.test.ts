import { describe, expect, it } from "vitest";
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
});
