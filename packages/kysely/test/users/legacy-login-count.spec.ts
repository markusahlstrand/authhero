import { describe, expect, it } from "vitest";
import SQLite from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { Migrator } from "kysely/migration";
import { Strategy } from "@authhero/adapter-interfaces";

import { Database } from "../../src/db";
import createAdapters from "../../src";
import ReferenceMigrationProvider from "../../migrate/ReferenceMigrationProvider";
import migrations from "../../migrate/migrations";

// Reproduces the production schema state where the o080 drop migration has
// not run yet: users.login_count still exists as NOT NULL without a default
// (its shape since the init migration), so an insert that omits it fails.
// users/create.ts must detect this and supply the column.
async function getPreO080Server() {
  const sqlite = new SQLite(":memory:");
  const db = new Kysely<Database>({
    dialect: new SqliteDialect({ database: sqlite }),
  });
  const migrator = new Migrator({
    db,
    provider: new ReferenceMigrationProvider(migrations),
  });
  const { error } = await migrator.migrateTo(
    "o079_user_activity_and_user_column_cleanup",
  );
  if (error) throw error;

  return { data: createAdapters(db), db };
}

describe("users create on a pre-o080 schema", () => {
  it("supplies login_count while the legacy NOT NULL column still exists", async () => {
    const { data, db } = await getPreO080Server();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const user = await data.users.create("tenantId", {
      user_id: "email|legacy1",
      email: "legacy1@example.com",
      email_verified: true,
      is_social: false,
      connection: Strategy.USERNAME_PASSWORD,
      provider: "authhero",
    });
    expect(user.login_count).toBe(0);

    const row = await db
      .selectFrom("users")
      .where("user_id", "=", "email|legacy1")
      .select("login_count")
      .executeTakeFirstOrThrow();
    expect(row.login_count).toBe(0);

    // A second create runs in the cached legacy mode and still routes the
    // activity counters to user_activity while keeping the legacy column fed.
    const migrated = await data.users.create("tenantId", {
      user_id: "email|legacy2",
      email: "legacy2@example.com",
      email_verified: true,
      is_social: false,
      connection: Strategy.USERNAME_PASSWORD,
      provider: "authhero",
      login_count: 7,
      last_login: "2026-07-01T00:00:00.000Z",
      last_ip: "127.0.0.1",
    });
    expect(migrated.login_count).toBe(7);

    const legacyRow = await db
      .selectFrom("users")
      .where("user_id", "=", "email|legacy2")
      .select("login_count")
      .executeTakeFirstOrThrow();
    expect(legacyRow.login_count).toBe(7);

    const activity = await db
      .selectFrom("user_activity")
      .where("user_id", "=", "email|legacy2")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(activity.login_count).toBe(7);
    expect(activity.last_ip).toBe("127.0.0.1");

    const fetched = await data.users.get("tenantId", "email|legacy2");
    expect(fetched?.login_count).toBe(7);
  });
});
