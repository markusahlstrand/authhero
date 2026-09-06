import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { getTestServer } from "../helpers/test-server";

// The dedupe (0008) is exercised directly rather than through the test
// server, because that helper applies every migration up front — leaving no
// point at which duplicate rows exist to be deduped. So: apply 0000-0007,
// seed duplicates, then apply 0008 alone.
function applyUpTo(sqlite: Database.Database, lastTag: string) {
  const dir = path.join(__dirname, "../../drizzle");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf-8");
    for (const stmt of sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)) {
      sqlite.exec(stmt);
    }
    if (file.startsWith(lastTag)) return;
  }
}

function applyOne(sqlite: Database.Database, tag: string) {
  const dir = path.join(__dirname, "../../drizzle");
  const file = fs.readdirSync(dir).find((f) => f.startsWith(tag))!;
  const sql = fs.readFileSync(path.join(dir, file), "utf-8");
  for (const stmt of sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean)) {
    sqlite.exec(stmt);
  }
}

describe("client_grants unique (tenant_id, client_id, audience)", () => {
  it("should enforce unique constraint on tenant_id + client_id + audience", async () => {
    const { data } = getTestServer();
    await data.tenants.create({ id: "t1", name: "Tenant 1" });

    await data.clientGrants.create("t1", {
      client_id: "client1",
      audience: "https://api.example.com",
      scope: ["read:users"],
    });

    await expect(
      data.clientGrants.create("t1", {
        client_id: "client1",
        audience: "https://api.example.com",
        scope: ["write:users"],
      }),
    ).rejects.toThrow();
  });

  it("allows the same pair on another audience or another tenant", async () => {
    const { data } = getTestServer();
    await data.tenants.create({ id: "t1", name: "Tenant 1" });
    await data.tenants.create({ id: "t2", name: "Tenant 2" });

    await data.clientGrants.create("t1", {
      client_id: "client1",
      audience: "https://api.example.com",
    });
    await data.clientGrants.create("t1", {
      client_id: "client1",
      audience: "https://other.example.com",
    });
    await data.clientGrants.create("t2", {
      client_id: "client1",
      audience: "https://api.example.com",
    });

    const t1 = await data.clientGrants.list("t1");
    const t2 = await data.clientGrants.list("t2");
    expect(t1.client_grants).toHaveLength(2);
    expect(t2.client_grants).toHaveLength(1);
  });

  describe("migration 0008 dedupe", () => {
    function seed() {
      const sqlite = new Database(":memory:");
      applyUpTo(sqlite, "0007");

      sqlite.exec(`INSERT INTO tenants (id, name, created_at, updated_at)
        VALUES ('t1', 'T1', '2026-01-01', '2026-01-01')`);
      sqlite.exec(`INSERT INTO tenants (id, name, created_at, updated_at)
        VALUES ('t2', 'T2', '2026-01-01', '2026-01-01')`);

      const grant = (
        id: string,
        tenantId: string,
        clientId: string,
        audience: string,
        createdAt: string,
      ) =>
        `INSERT INTO client_grants
          (id, tenant_id, client_id, audience, scope, created_at, updated_at)
         VALUES ('${id}', '${tenantId}', '${clientId}', '${audience}',
           '["scope:${id}"]', '${createdAt}', '${createdAt}')`;

      // Three duplicates of the same pair — only the newest should survive.
      sqlite.exec(grant("dup-old", "t1", "c1", "https://api", "2026-01-01"));
      sqlite.exec(grant("dup-mid", "t1", "c1", "https://api", "2026-02-01"));
      sqlite.exec(grant("dup-new", "t1", "c1", "https://api", "2026-03-01"));
      // Same pair in another tenant, and another audience in t1 — untouched.
      sqlite.exec(
        grant("other-tenant", "t2", "c1", "https://api", "2026-01-01"),
      );
      sqlite.exec(grant("other-aud", "t1", "c1", "https://api2", "2026-01-01"));

      return sqlite;
    }

    it("keeps only the newest row per pair and leaves the rest alone", () => {
      const sqlite = seed();
      applyOne(sqlite, "0008");

      const ids = sqlite
        .prepare("SELECT id FROM client_grants ORDER BY id")
        .all()
        .map((r: any) => r.id);
      expect(ids).toEqual(["dup-new", "other-aud", "other-tenant"]);
    });

    it("breaks a created_at tie by keeping the last-inserted row", () => {
      const sqlite = new Database(":memory:");
      applyUpTo(sqlite, "0007");
      sqlite.exec(`INSERT INTO tenants (id, name, created_at, updated_at)
        VALUES ('t1', 'T1', '2026-01-01', '2026-01-01')`);
      for (const id of ["tie-a", "tie-b"]) {
        sqlite.exec(`INSERT INTO client_grants
          (id, tenant_id, client_id, audience, scope, created_at, updated_at)
         VALUES ('${id}', 't1', 'c1', 'https://api', '[]',
           '2026-01-01', '2026-01-01')`);
      }
      applyOne(sqlite, "0008");

      const ids = sqlite
        .prepare("SELECT id FROM client_grants")
        .all()
        .map((r: any) => r.id);
      expect(ids).toEqual(["tie-b"]);
    });

    it("creates the unique index so new duplicates are rejected", () => {
      const sqlite = seed();
      applyOne(sqlite, "0008");

      expect(() =>
        sqlite.exec(`INSERT INTO client_grants
          (id, tenant_id, client_id, audience, scope, created_at, updated_at)
         VALUES ('dup-again', 't1', 'c1', 'https://api', '[]',
           '2026-04-01', '2026-04-01')`),
      ).toThrow(
        /UNIQUE constraint failed: client_grants\.tenant_id, client_grants\.client_id, client_grants\.audience/,
      );
    });
  });
});
