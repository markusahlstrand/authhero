import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";
import { migrationLog } from "../log";

/**
 * Bundles three forward-only schema changes into a single PlanetScale rebuild
 * (see issue #1003). The read/write cutover to `user_activity` and the
 * `profileData` enrichment land in follow-up PRs — this migration only changes
 * the schema, it does not move or backfill any data.
 *
 * 1. Converts the large, unbounded, non-indexed `users` columns to TEXT so they
 *    are stored off-page (relieves InnoDB row-size pressure and removes the
 *    length cap that today truncates enriched profile data).
 * 2. Right-sizes a few oversized `users` varchars.
 * 3. Adds an (empty) `user_activity` entity for the write-often counters that
 *    currently churn the `users` row on every login / failed password attempt.
 *
 * The column changes only matter on MySQL/PlanetScale — SQLite has TEXT
 * affinity and ignores varchar lengths, so we branch on dialect like the other
 * column-altering migrations in this folder.
 */

async function getDatabaseType(
  db: Kysely<Database>,
): Promise<"mysql" | "sqlite"> {
  try {
    await sql`SELECT VERSION()`.execute(db);
    return "mysql";
  } catch {
    return "sqlite";
  }
}

export async function up(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  if (dbType === "mysql") {
    migrationLog(
      "Converting users blob columns to TEXT and right-sizing oversized varchars...",
    );

    // Unbounded, non-indexed payloads → TEXT.
    await db.schema.alterTable("users").modifyColumn("profileData", "text").execute();
    await db.schema.alterTable("users").modifyColumn("picture", "text").execute();

    // app_metadata is NOT NULL and create.ts can insert `undefined`, relying on
    // the column default. TEXT cannot take a *literal* default, so use a MySQL
    // 8.0.13+ expression default: `DEFAULT ('{}')`.
    await db.schema
      .alterTable("users")
      .modifyColumn("app_metadata", "text", (col) =>
        col.notNull().defaultTo(sql`('{}')`),
      )
      .execute();

    // Oversized varchars → right-sized. App-generated ISO timestamps are ≤29
    // chars and locale codes are short, so there is no truncation risk.
    await db.schema
      .alterTable("users")
      .modifyColumn("created_at", "varchar(35)", (col) => col.notNull())
      .execute();
    await db.schema
      .alterTable("users")
      .modifyColumn("updated_at", "varchar(35)", (col) => col.notNull())
      .execute();
    await db.schema.alterTable("users").modifyColumn("locale", "varchar(64)").execute();
  }

  // Additive on both dialects. Mirrors the `grants` FK pattern: references the
  // (user_id, tenant_id) key on users with ON DELETE CASCADE so stats are
  // cleaned up with the user. Counters are populated/read in a follow-up PR.
  await db.schema
    .createTable("user_activity")
    .ifNotExists()
    .addColumn("tenant_id", "varchar(255)", (col) => col.notNull())
    .addColumn("user_id", "varchar(255)", (col) => col.notNull())
    .addColumn("last_login", "varchar(35)")
    .addColumn("last_ip", "varchar(45)") // right-sized for IPv6
    .addColumn("login_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("failed_logins", "text") // JSON array of lockout timestamps
    .addColumn("last_password_reset", "varchar(35)")
    .addPrimaryKeyConstraint("user_activity_pkey", ["tenant_id", "user_id"])
    .addForeignKeyConstraint(
      "user_activity_user_id_constraint",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  await db.schema.dropTable("user_activity").ifExists().execute();

  if (dbType === "mysql") {
    await db.schema
      .alterTable("users")
      .modifyColumn("profileData", "varchar(2048)")
      .execute();
    await db.schema
      .alterTable("users")
      .modifyColumn("picture", "varchar(2083)")
      .execute();
    await db.schema
      .alterTable("users")
      .modifyColumn("app_metadata", "varchar(4096)", (col) =>
        col.notNull().defaultTo("{}"),
      )
      .execute();
    await db.schema
      .alterTable("users")
      .modifyColumn("created_at", "varchar(255)", (col) => col.notNull())
      .execute();
    await db.schema
      .alterTable("users")
      .modifyColumn("updated_at", "varchar(255)", (col) => col.notNull())
      .execute();
    await db.schema
      .alterTable("users")
      .modifyColumn("locale", "varchar(255)")
      .execute();
  }
}
