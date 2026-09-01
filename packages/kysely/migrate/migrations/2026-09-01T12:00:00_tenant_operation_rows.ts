import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Per-item checkpoints for batch tenant operations (issue #1325), plus the
 * four columns on `tenant_operations` that make a batch durable and
 * single-driver: `input` (the parameters the batch was created with),
 * `result` (the summary), and the `claimed_by` / `claim_expires_at` lease.
 *
 * `tenant_operation_rows` is keyed by (operation_id, seq): the item's
 * position in the submitted file is its identity, so a replayed chunk
 * collides with the row it already wrote instead of duplicating it.
 *
 * No foreign key to `tenant_operations`, mirroring `scim_*`: SQLite has no
 * `ALTER TABLE ADD CONSTRAINT`, so a cross-engine FK would have to be
 * inlined at create time on SQLite and altered in on MySQL, and PlanetScale
 * does not enforce FKs anyway. `removeByOperation` is the cleanup path.
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
async function safeCreateIndex(
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
  await safeAddColumn(db, "tenant_operations", "input", sql`text`);
  await safeAddColumn(db, "tenant_operations", "result", sql`text`);
  await safeAddColumn(db, "tenant_operations", "claimed_by", sql`varchar(255)`);
  await safeAddColumn(
    db,
    "tenant_operations",
    "claim_expires_at",
    sql`varchar(35)`,
  );

  await db.schema
    .createTable("tenant_operation_rows")
    .ifNotExists()
    .addColumn("operation_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("seq", sql`int`, (col) => col.notNull())
    .addColumn("payload", sql`text`, (col) => col.notNull())
    .addColumn("status", sql`varchar(32)`, (col) => col.notNull())
    .addColumn("error_code", sql`varchar(64)`)
    .addColumn("error_message", sql`text`)
    .addColumn("error_path", sql`varchar(255)`)
    .addColumn("entity_id", sql`varchar(255)`)
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
    .addPrimaryKeyConstraint("tenant_operation_rows_pk", [
      "operation_id",
      "seq",
    ])
    .execute();

  // Drives claimPending (status + seq order) and the status rollup.
  await safeCreateIndex(
    db,
    "tenant_operation_rows_operation_status_seq_idx",
    "tenant_operation_rows",
    ["operation_id", "status", "seq"],
  );

  // Resume sweep: pending/running work whose lease is absent or expired.
  await safeCreateIndex(
    db,
    "tenant_operations_kind_status_created_at_idx",
    "tenant_operations",
    ["kind", "status", "created_at"],
  );
}

// PlanetScale doesn't support IF EXISTS here, so tolerate "doesn't exist".
async function safeDropColumn(
  db: Kysely<Database>,
  tableName: string,
  columnName: string,
): Promise<void> {
  try {
    await db.schema.alterTable(tableName).dropColumn(columnName).execute();
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("1091")) return;
    throw error;
  }
}

export async function down(db: Kysely<Database>): Promise<void> {
  try {
    await db.schema
      .dropIndex("tenant_operations_kind_status_created_at_idx")
      .on("tenant_operations")
      .execute();
  } catch {
    /* index may not exist */
  }
  await db.schema.dropTable("tenant_operation_rows").ifExists().execute();
  await safeDropColumn(db, "tenant_operations", "claim_expires_at");
  await safeDropColumn(db, "tenant_operations", "claimed_by");
  await safeDropColumn(db, "tenant_operations", "result");
  await safeDropColumn(db, "tenant_operations", "input");
}
