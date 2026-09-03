import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { clientGrants } from "../../src/schema/sqlite";

describe("clientGrants adapter", () => {
  let data: ReturnType<typeof getTestServer>["data"];
  let db: ReturnType<typeof getTestServer>["db"];

  beforeEach(async () => {
    const server = getTestServer();
    data = server.data;
    db = server.db;

    await data.tenants.create({ id: "t1", name: "Tenant 1" });
  });

  // created_at is written with millisecond precision, so seed explicit
  // timestamps rather than relying on the ordering of three fast inserts.
  async function seedGrants() {
    const rows = [
      { id: "grant-old", audience: "https://old.example.com", day: "01" },
      { id: "grant-mid", audience: "https://mid.example.com", day: "02" },
      { id: "grant-new", audience: "https://new.example.com", day: "03" },
    ];

    for (const row of rows) {
      await db.insert(clientGrants).values({
        id: row.id,
        tenant_id: "t1",
        client_id: "client1",
        audience: row.audience,
        scope: JSON.stringify(["read:things"]),
        created_at: `2026-01-${row.day}T00:00:00.000Z`,
        updated_at: `2026-01-${row.day}T00:00:00.000Z`,
      });
    }
  }

  it("should default to newest first when no sort is given", async () => {
    await seedGrants();

    const result = await data.clientGrants.list("t1", {
      page: 0,
      per_page: 50,
      include_totals: false,
    });

    expect(result.client_grants.map((g) => g.id)).toEqual([
      "grant-new",
      "grant-mid",
      "grant-old",
    ]);
  });

  it("should page from the newest grant when no sort is given", async () => {
    await seedGrants();

    const result = await data.clientGrants.list("t1", {
      page: 0,
      per_page: 1,
      include_totals: true,
    });

    expect(result.client_grants.map((g) => g.id)).toEqual(["grant-new"]);
    expect(result.length).toBe(3);
  });

  it("should page stably when grants share a created_at timestamp", async () => {
    const sameInstant = "2026-01-01T00:00:00.000Z";
    for (const id of ["grant-a", "grant-b", "grant-c"]) {
      await db.insert(clientGrants).values({
        id,
        tenant_id: "t1",
        client_id: "client1",
        audience: `https://${id}.example.com`,
        scope: JSON.stringify(["read:things"]),
        created_at: sameInstant,
        updated_at: sameInstant,
      });
    }

    // The id tiebreaker gives tied rows a total order, so walking the pages
    // sees each grant exactly once with no gap or repeat at the boundary.
    const firstPage = await data.clientGrants.list("t1", {
      page: 0,
      per_page: 2,
      include_totals: false,
    });
    const secondPage = await data.clientGrants.list("t1", {
      page: 1,
      per_page: 2,
      include_totals: false,
    });

    const walked = [
      ...firstPage.client_grants.map((g) => g.id),
      ...secondPage.client_grants.map((g) => g.id),
    ];
    expect(walked).toEqual(["grant-c", "grant-b", "grant-a"]);
  });

  it("should still honour an explicit ascending sort", async () => {
    await seedGrants();

    const result = await data.clientGrants.list("t1", {
      page: 0,
      per_page: 50,
      include_totals: false,
      sort: { sort_by: "created_at", sort_order: "asc" },
    });

    expect(result.client_grants.map((g) => g.id)).toEqual([
      "grant-old",
      "grant-mid",
      "grant-new",
    ]);
  });
});
