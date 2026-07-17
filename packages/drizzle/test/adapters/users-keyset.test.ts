import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

// Users keyset on created_at (asc/desc) with user_id as the unique
// tiebreaker. A superset of Auth0, which caps /users at 1000 results with
// offset paging only. Linked accounts stay folded into identities during
// cursor walks, and the cursor records the sort it was minted under so a
// token replayed with a different sort fails instead of returning pages
// from the wrong position.
describe("users keyset pagination (from/take)", () => {
  let data: ReturnType<typeof getTestServer>["data"];
  const tenantId = "t1";

  beforeEach(async () => {
    const server = getTestServer();
    data = server.data;

    await data.tenants.create({ id: tenantId, name: "Tenant 1" });

    // Seed more rows than a single page. created_at has second-ish
    // resolution, so rows share timestamps — the user_id tiebreaker matters.
    for (let i = 0; i < 25; i++) {
      await data.users.create(tenantId, {
        user_id: `email|keyset-${i.toString().padStart(2, "0")}`,
        email: `keyset-${i.toString().padStart(2, "0")}@example.com`,
        email_verified: true,
        connection: "email",
        provider: "email",
        is_social: false,
      });
    }
  });

  it("walks every user exactly once and folds linked accounts in", async () => {
    // Link a secondary account to the first user; it must appear as an
    // identity, never as a top-level row of the walk.
    await data.users.create(tenantId, {
      user_id: "auth2|keyset-linked",
      email: "keyset-00@example.com",
      email_verified: true,
      connection: "Username-Password-Authentication",
      provider: "auth2",
      is_social: false,
      linked_to: "email|keyset-00",
    });

    const seen = new Set<string>();
    let from: string | undefined;
    let pages = 0;
    let linkedIdentitySeen = false;

    for (;;) {
      const res = await data.users.list(tenantId, { take: 10, from });
      pages++;
      expect(res.users.length).toBeLessThanOrEqual(10);
      for (const user of res.users) {
        expect(user.user_id).not.toBe("auth2|keyset-linked");
        expect(seen.has(user.user_id)).toBe(false); // no duplicates
        seen.add(user.user_id);
        if (user.user_id === "email|keyset-00") {
          linkedIdentitySeen =
            user.identities?.some((i) => i.provider === "auth2") ?? false;
        }
      }
      if (!res.next) break;
      expect(res.next).not.toMatch(/^\d+$/); // opaque, not an offset
      from = res.next;
      if (pages > 10) throw new Error("cursor walk did not terminate");
    }

    expect(seen.size).toBe(25);
    expect(pages).toBe(3); // 10 + 10 + 5
    expect(linkedIdentitySeen).toBe(true);
  });

  it("honors sort=created_at asc and rejects replay under another sort", async () => {
    // Seeded rows share created_at (second resolution), so ordering must be
    // lexicographic on the full (created_at, user_id) keyset, not just the
    // sort column.
    const assertAscending = (
      rows: { created_at: string; user_id: string }[],
    ) => {
      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1];
        const cur = rows[i];
        const ordered =
          prev.created_at < cur.created_at ||
          (prev.created_at === cur.created_at && prev.user_id < cur.user_id);
        expect(ordered).toBe(true);
      }
    };

    const page1 = await data.users.list(tenantId, {
      take: 10,
      sort: { sort_by: "created_at", sort_order: "asc" },
    });
    expect(page1.users).toHaveLength(10);
    expect(page1.next).toBeDefined();
    assertAscending(page1.users);

    const page2 = await data.users.list(tenantId, {
      take: 10,
      from: page1.next,
      sort: { sort_by: "created_at", sort_order: "asc" },
    });
    expect(page2.users).toHaveLength(10);
    // Order must hold across the page boundary too.
    assertAscending([page1.users[9], ...page2.users]);

    await expect(
      data.users.list(tenantId, {
        take: 10,
        from: page1.next,
        sort: { sort_by: "created_at", sort_order: "desc" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects unsupported sort columns in checkpoint mode", async () => {
    await expect(
      data.users.list(tenantId, {
        take: 10,
        sort: { sort_by: "email", sort_order: "asc" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("omits next on the final page", async () => {
    const res = await data.users.list(tenantId, { take: 50 });
    expect(res.users).toHaveLength(25);
    expect(res.next).toBeUndefined();
  });
});
