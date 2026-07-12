import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "./helpers/test-server";
import { decodeCursor } from "@authhero/adapter-interfaces";

// Exercises the shared keyset paginator via the user-organizations adapter,
// which sorts by created_at desc with id as the tiebreaker.
describe("keyset pagination (from/take)", () => {
  let data: any;
  const tenantId = "keyset-tenant";
  const organizationId = "org_keyset";

  beforeEach(async () => {
    const server = await getTestServer();
    data = server.data;

    await data.organizations.create(tenantId, {
      id: organizationId,
      name: "keyset-org",
      display_name: "Keyset Org",
    });

    // Seed more rows than a single page. created_at has second-ish resolution,
    // so many rows can share a timestamp — this is exactly why the id
    // tiebreaker matters, and the test deliberately does not space them out.
    for (let i = 0; i < 25; i++) {
      await data.userOrganizations.create(tenantId, {
        user_id: `user-${i.toString().padStart(2, "0")}`,
        organization_id: organizationId,
      });
    }
  });

  it("walks every row exactly once across pages via next", async () => {
    const q = `organization_id:${organizationId}`;
    const seen = new Set<string>();
    let from: string | undefined;
    let pages = 0;

    for (;;) {
      const res = await data.userOrganizations.list(tenantId, {
        q,
        take: 10,
        from,
      });
      pages++;
      expect(res.userOrganizations.length).toBeLessThanOrEqual(10);
      for (const row of res.userOrganizations) {
        expect(seen.has(row.id)).toBe(false); // no duplicates across pages
        seen.add(row.id);
      }
      if (!res.next) break;
      from = res.next;
      if (pages > 10) throw new Error("cursor walk did not terminate");
    }

    expect(seen.size).toBe(25);
    expect(pages).toBe(3); // 10 + 10 + 5
  });

  it("omits next on the final page", async () => {
    const res = await data.userOrganizations.list(tenantId, {
      q: `organization_id:${organizationId}`,
      take: 50,
    });
    expect(res.userOrganizations).toHaveLength(25);
    expect(res.next).toBeUndefined();
  });

  it("emits an opaque, decodable cursor (not a numeric offset)", async () => {
    const res = await data.userOrganizations.list(tenantId, {
      q: `organization_id:${organizationId}`,
      take: 10,
    });
    expect(res.next).toBeDefined();
    // A bare offset like "10" must NOT be what we hand back.
    expect(res.next).not.toBe("10");
    const decoded = decodeCursor(res.next);
    expect(decoded).not.toBeNull();
    expect(typeof decoded!.i).toBe("string");
  });

  it("is stable when a row is inserted mid-walk", async () => {
    const q = `organization_id:${organizationId}`;
    const page1 = await data.userOrganizations.list(tenantId, { q, take: 10 });

    // Insert a new membership between page fetches. Offset pagination would
    // shift rows and duplicate/skip; keyset must not.
    await data.userOrganizations.create(tenantId, {
      user_id: "user-inserted",
      organization_id: organizationId,
    });

    const page1Ids = new Set(page1.userOrganizations.map((r: any) => r.id));
    const page2 = await data.userOrganizations.list(tenantId, {
      q,
      take: 10,
      from: page1.next,
    });
    for (const row of page2.userOrganizations) {
      expect(page1Ids.has(row.id)).toBe(false);
    }
  });
});

// Role users collapse per-organization assignments to distinct user_ids and
// keyset on user_id itself (user_roles has no surrogate id, and user_id is
// unique once assignments are collapsed).
describe("role users keyset pagination (from/take)", () => {
  let data: any;
  const tenantId = "keyset-role-users-tenant";
  let roleId: string;

  beforeEach(async () => {
    const server = await getTestServer();
    data = server.data;

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

// Logs honor q, date-range filters, and a date asc/desc sort in checkpoint
// mode (a superset of Auth0, which ignores q/sort under from/take on /logs).
// The cursor records the sort it was minted under so a token replayed with a
// different sort fails instead of returning pages from the wrong position.
describe("logs keyset pagination (from/take)", () => {
  let data: any;
  const tenantId = "keyset-logs-tenant";

  beforeEach(async () => {
    const server = await getTestServer();
    data = server.data;

    // 25 logs across 5 timestamps (5 rows per timestamp) so pages routinely
    // split inside a shared date — exactly where the log_id tiebreaker
    // matters. Alternate user_ids for the filtered-walk test.
    for (let i = 0; i < 25; i++) {
      const second = Math.floor(i / 5);
      await data.logs.create(tenantId, {
        log_id: `log-${i.toString().padStart(2, "0")}`,
        type: "s",
        date: `2026-01-01T00:00:0${second}.000Z`,
        isMobile: false,
        user_id: i % 2 === 0 ? "user-even" : "user-odd",
      });
    }
  });

  it("walks every row exactly once in date desc order by default", async () => {
    const seen: string[] = [];
    let from: string | undefined;
    let pages = 0;
    let lastDate: string | undefined;

    for (;;) {
      const res = await data.logs.list(tenantId, { take: 10, from });
      pages++;
      for (const log of res.logs) {
        expect(seen.includes(log.log_id)).toBe(false);
        seen.push(log.log_id);
        if (lastDate !== undefined) {
          expect(log.date <= lastDate).toBe(true);
        }
        lastDate = log.date;
      }
      if (!res.next) break;
      from = res.next;
      if (pages > 10) throw new Error("cursor walk did not terminate");
    }

    expect(seen.length).toBe(25);
    expect(pages).toBe(3);
  });

  it("honors sort=date asc in checkpoint mode", async () => {
    const res = await data.logs.list(tenantId, {
      take: 10,
      sort: { sort_by: "date", sort_order: "asc" },
    });
    expect(res.logs).toHaveLength(10);
    expect(res.logs[0].date <= res.logs[9].date).toBe(true);

    const page2 = await data.logs.list(tenantId, {
      take: 10,
      from: res.next,
      sort: { sort_by: "date", sort_order: "asc" },
    });
    expect(res.logs[9].date <= page2.logs[0].date).toBe(true);
  });

  it("honors q filters inside a cursor walk", async () => {
    const seen = new Set<string>();
    let from: string | undefined;

    for (;;) {
      const res = await data.logs.list(tenantId, {
        q: "user_id:user-even",
        take: 5,
        from,
      });
      for (const log of res.logs) {
        expect(log.user_id).toBe("user-even");
        seen.add(log.log_id);
      }
      if (!res.next) break;
      from = res.next;
    }

    expect(seen.size).toBe(13); // even indices 0..24
  });

  it("rejects a cursor replayed under a different sort", async () => {
    const page1 = await data.logs.list(tenantId, { take: 10 });
    expect(page1.next).toBeDefined();

    await expect(
      data.logs.list(tenantId, {
        take: 10,
        from: page1.next,
        sort: { sort_by: "date", sort_order: "asc" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects unsupported sort columns in checkpoint mode", async () => {
    await expect(
      data.logs.list(tenantId, {
        take: 10,
        sort: { sort_by: "user_id", sort_order: "asc" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("omits next on the final page", async () => {
    const res = await data.logs.list(tenantId, { take: 50 });
    expect(res.logs).toHaveLength(25);
    expect(res.next).toBeUndefined();
  });
});
