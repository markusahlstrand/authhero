import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Custom Token Exchange profiles (issue #1417), plus the `token_exchange`
 * JSON column on `clients` that opts a client in to them.
 *
 * The unique (tenant_id, subject_token_type) index is what makes a
 * `subject_token_type` resolve to a single profile; a duplicate create
 * surfaces as a constraint error that the management API maps to 409.
 */

// Tolerates "duplicate column" (MySQL errno 1060) so the migration is safe to
// re-run against a database that already has the column.
async function safeAddColumn(
  db: Kysely<Database>,
  tableName: string,
  columnName: string,
  columnType: ReturnType<typeof sql>,
): Promise<void> {
  try {
    await db.schema
      .alterTable(tableName)
      .addColumn(columnName, columnType)
      .execute();
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes("1060") ||
        error.message.toLowerCase().includes("duplicate column"))
    ) {
      return;
    }
    throw error;
  }
}

// MySQL has no `CREATE INDEX IF NOT EXISTS`, so tolerate "duplicate key name"
// (errno 1061) / SQLite's "already exists" instead of asking for it.
async function safeCreateUniqueIndex(
  db: Kysely<Database>,
  indexName: string,
  tableName: string,
  columns: string[],
): Promise<void> {
  try {
    await db.schema
      .createIndex(indexName)
      .on(tableName)
      .columns(columns)
      .unique()
      .execute();
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes("1061") ||
        error.message.toLowerCase().includes("already exists"))
    ) {
      return;
    }
    throw error;
  }
}

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("token_exchange_profiles")
    .ifNotExists()
    .addColumn("id", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("subject_token_type", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("action_id", sql`varchar(255)`)
    .addColumn("type", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("jwt_verification", sql`text`)
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
    .addPrimaryKeyConstraint("token_exchange_profiles_pk", ["id"])
    .execute();

  await safeCreateUniqueIndex(
    db,
    "token_exchange_profiles_tenant_subject_token_type_idx",
    "token_exchange_profiles",
    ["tenant_id", "subject_token_type"],
  );

  await safeAddColumn(db, "clients", "token_exchange", sql`text`);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("token_exchange_profiles").ifExists().execute();
  try {
    await db.schema
      .alterTable("clients")
      .dropColumn("token_exchange")
      .execute();
  } catch (error: unknown) {
    // PlanetScale doesn't support IF EXISTS here, so tolerate "doesn't exist".
    if (error instanceof Error && error.message.includes("1091")) return;
    throw error;
  }
}
