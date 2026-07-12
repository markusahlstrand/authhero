import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

// Role users collapse per-organization assignments to distinct user_ids and
// keyset on user_id itself (user_roles has no surrogate id, and user_id is
// unique once assignments are collapsed).
describe("role users keyset pagination (from/take)", () => {
  let data: ReturnType<typeof getTestServer>["data"];
  const tenantId = "t1";
  let roleId: string;

  beforeEach(async () => {
    const server = getTestServer();
    data = server.data;

    await data.tenants.create({ id: tenantId, name: "Tenant 1" });

    const role = await data.roles.create(tenantId, {
      name: "keyset-role",
      description: "Keyset role",
    });
    roleId = role.id;

    for (let i = 0; i < 25; i++) {
      await data.userRoles.create(
        tenantId,
        `user-${i.toString().padStart(2, "0")}`,
        roleId,
      );
    }
    // The same user holding the role under organization scopes must still
    // appear exactly once in the listing.
    await data.userRoles.create(tenantId, "user-00", roleId, "org-a");
    await data.userRoles.create(tenantId, "user-00", roleId, "org-b");
  });

  it("walks every distinct user exactly once across pages via next", async () => {
    const seen = new Set<string>();
    let from: string | undefined;
    let pages = 0;

    for (;;) {
      const res = await data.userRoles.listUsers(tenantId, roleId, {
        take: 10,
        from,
      });
      pages++;
      for (const userId of res.userIds) {
        expect(seen.has(userId)).toBe(false); // no duplicates across pages
        seen.add(userId);
      }
      if (!res.next) break;
      from = res.next;
      if (pages > 10) throw new Error("cursor walk did not terminate");
    }

    expect(seen.size).toBe(25);
    expect(pages).toBe(3); // 10 + 10 + 5
  });

  it("omits next on the final page", async () => {
    const res = await data.userRoles.listUsers(tenantId, roleId, {
      take: 50,
    });
    expect(res.userIds).toHaveLength(25);
    expect(res.next).toBeUndefined();
  });

  it("counts distinct users in offset mode", async () => {
    const res = await data.userRoles.listUsers(tenantId, roleId, {
      page: 0,
      per_page: 10,
    });
    expect(res.userIds).toHaveLength(10);
    expect(res.length).toBe(25); // org-scoped duplicates collapsed
  });
});
