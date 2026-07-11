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
