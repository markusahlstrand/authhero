import { describe, expect, it, beforeEach } from "vitest";
import { decodeCursor, encodeCursor } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";

// Checkpoint (from/take) pagination for role permissions, backing
// GET /api/v2/roles/{id}/permissions. Fixed (resource_server_identifier,
// permission_name) asc order — the composite key, no surrogate id.
describe("role permissions keyset pagination (from/take)", () => {
  let data: Awaited<ReturnType<typeof getTestServer>>["data"];
  const tenantId = "tenantId";
  let roleId: string;

  const key = (p: {
    resource_server_identifier: string;
    permission_name: string;
  }) => `${p.resource_server_identifier}|${p.permission_name}`;

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
    const role = await data.roles.create(tenantId, { name: "role" });
    roleId = role.id;

    // Several permissions share a resource server, so the permission name has
    // to carry the tiebreak.
    const permissions = Array.from({ length: 25 }, (_, i) => ({
      role_id: roleId,
      resource_server_identifier: `https://api-${i % 3}.example.com`,
      permission_name: `perm:${i.toString().padStart(2, "0")}`,
    }));
    await data.rolePermissions.assign(tenantId, roleId, permissions);
  });

  async function walk(take: number) {
    const seen: string[] = [];
    let from: string | undefined;
    let pages = 0;
    for (;;) {
      const res = await data.rolePermissions.listCheckpoint!(tenantId, roleId, {
        take,
        from,
      });
      pages++;
      expect(res.permissions.length).toBeLessThanOrEqual(take);
      seen.push(...res.permissions.map(key));
      if (!res.next) break;
      from = res.next;
      if (pages > 20) throw new Error("cursor walk did not terminate");
    }
    return { seen, pages };
  }

  it("walks every permission exactly once across pages via next", async () => {
    const { seen, pages } = await walk(10);
    expect(new Set(seen).size).toBe(25); // no duplicates
    expect(seen).toHaveLength(25); // no gaps
    expect(pages).toBe(3); // 10 + 10 + 5
    expect(seen).toEqual([...seen].sort());
  });

  it("emits an opaque, decodable cursor (not a numeric offset)", async () => {
    const res = await data.rolePermissions.listCheckpoint!(tenantId, roleId, {
      take: 10,
    });
    expect(res.next).toBeDefined();
    expect(res.next).not.toBe("10");
    const decoded = decodeCursor(res.next!);
    expect(decoded).not.toBeNull();
    expect(typeof decoded!.i).toBe("string");
  });

  it("is stable when a permission is inserted mid-walk", async () => {
    const page1 = await data.rolePermissions.listCheckpoint!(tenantId, roleId, {
      take: 10,
    });
    await data.rolePermissions.assign(tenantId, roleId, [
      {
        role_id: roleId,
        resource_server_identifier: "https://api-0.example.com",
        permission_name: "aaa:inserted",
      },
    ]);

    const seen = new Set(page1.permissions.map(key));
    let from = page1.next;
    while (from) {
      const res = await data.rolePermissions.listCheckpoint!(tenantId, roleId, {
        take: 10,
        from,
      });
      for (const p of res.permissions) {
        expect(seen.has(key(p))).toBe(false);
        seen.add(key(p));
      }
      from = res.next;
    }
    expect(seen.size).toBeGreaterThanOrEqual(25);
  });

  it("rejects a cursor minted under a different sort", async () => {
    const page1 = await data.rolePermissions.listCheckpoint!(tenantId, roleId, {
      take: 10,
    });
    const foreign = encodeCursor({
      ...decodeCursor(page1.next!)!,
      k: "created_at:desc",
    });
    await expect(
      data.rolePermissions.listCheckpoint!(tenantId, roleId, {
        take: 10,
        from: foreign,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("stays inside the requested role", async () => {
    const other = await data.roles.create(tenantId, { name: "other" });
    await data.rolePermissions.assign(tenantId, other.id, [
      {
        role_id: other.id,
        resource_server_identifier: "https://api-0.example.com",
        permission_name: "perm:foreign",
      },
    ]);
    const { seen } = await walk(10);
    expect(seen).toHaveLength(25);
    expect(seen).not.toContain("https://api-0.example.com|perm:foreign");
  });

  it("leaves the offset mode untouched", async () => {
    const page0 = await data.rolePermissions.list(tenantId, roleId, {
      page: 0,
      per_page: 10,
    });
    const page2 = await data.rolePermissions.list(tenantId, roleId, {
      page: 2,
      per_page: 10,
    });
    expect(Array.isArray(page0)).toBe(true);
    expect(page0).toHaveLength(10);
    expect(page2).toHaveLength(5);
  });
});
