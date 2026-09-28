import { describe, expect, it } from "vitest";
import { Kysely, SqliteDialect, sql } from "kysely";
import SQLite from "better-sqlite3";
import {
  Database,
  formatMigrationPlan,
  migrateToLatest,
  planMigrations,
} from "../src";
import migrations from "../migrate/migrations";

function createDb() {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: new SQLite(":memory:") }),
  });
}

async function tableNames(db: Kysely<Database>): Promise<string[]> {
  const { rows } = await sql<{
    name: string;
  }>`SELECT name FROM sqlite_master WHERE type = 'table'`.execute(db);
  return rows.map((row) => row.name);
}

describe("planMigrations", () => {
  it("lists every migration on an empty database without writing anything", async () => {
    const db = createDb();

    const plan = await planMigrations(db);

    expect(plan.executed).toEqual([]);
    expect(plan.pending.map((it) => it.name)).toEqual(Object.keys(migrations));
    const baseline = plan.pending[0]!;
    expect(baseline.error).toBeUndefined();
    expect(
      baseline.statements.some((it) => /^create table "users"/.test(it.sql)),
    ).toBe(true);

    // Not even the kysely_migration bookkeeping tables.
    expect(await tableNames(db)).toEqual([]);
    await db.destroy();
  });

  it("reports nothing pending on a migrated database", async () => {
    const db = createDb();
    await migrateToLatest(db, false);

    const plan = await planMigrations(db);

    expect(plan.pending).toEqual([]);
    expect(plan.executed).toEqual(Object.keys(migrations));
    expect(formatMigrationPlan(plan)).toMatch(/up to date/);
    await db.destroy();
  });

  it("plans only the migrations that have not run", async () => {
    const db = createDb();
    await migrateToLatest(db, false);
    const last = "2026-09-25T12:00:00_token_exchange_profiles";
    await migrations[last].down(db);
    await sql`DELETE FROM kysely_migration WHERE name = ${last}`.execute(db);

    const plan = await planMigrations(db);

    expect(plan.pending.map((it) => it.name)).toEqual([last]);
    expect(plan.pending[0]!.error).toBeUndefined();
    const output = formatMigrationPlan(plan);
    expect(output).toMatch(
      /create table if not exists "token_exchange_profiles"/i,
    );
    expect(await tableNames(db)).not.toContain("token_exchange_profiles");

    // The real run still applies it afterwards.
    await migrateToLatest(db, false);
    expect(await tableNames(db)).toContain("token_exchange_profiles");
    await db.destroy();
  });
});
