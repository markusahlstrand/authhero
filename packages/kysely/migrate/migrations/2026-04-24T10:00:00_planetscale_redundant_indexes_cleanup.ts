import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";
import { migrationWarn } from "../log";

/**
 * Applies PlanetScale schema recommendations:
 * - Drops single-column tenant_id indexes that are redundant because another
 *   composite index / primary key already has tenant_id as its leading column.
 * - Drops role_permissions_role_fk which is covered by the composite PK.
 * - Drops the unused `members` table (left over from the 2022 init migration).
 *
 * Most of these indexes only exist on PlanetScale (MySQL); local SQLite
 * environments either never created them or already dropped them in earlier
 * migrations. We branch on dialect because Kysely's `dropIndex().on(table)`
 * emits MySQL-only `DROP INDEX name ON table` syntax that SQLite rejects.
 */

async function getDatabaseType(
  db: Kysely<Database>,
): Promise<"mysql" | "sqlite"> {
  try {
    await sql`SELECT @@version_comment`.execute(db);
    return "mysql";
  } catch {
    return "sqlite";
  }
}

const REDUNDANT_INDEXES: Array<{
  index: string;
  table: string;
  reason: string;
}> = [
  {
    index: "connections_tenant_id_idx",
    table: "connections",
    reason: "composite PK (tenant_id, id)",
  },
  {
    index: "idx_invites_tenant_id",
    table: "invites",
    reason: "idx_invites_tenant_created (tenant_id, created_at)",
  },
  {
    index: "idx_organizations_tenant_id",
    table: "organizations",
    reason: "idx_organizations_tenant_name_unique (tenant_id, name)",
  },
  {
    index: "role_permissions_role_fk",
    table: "role_permissions",
    reason: "role_permissions_pk (tenant_id, role_id, ...)",
  },
  {
    index: "themes_tenant_id_idx",
    table: "themes",
    reason: "themes_pkey (tenant_id, themeId)",
  },
  {
    index: "users_tenant_index",
    table: "users",
    reason: "stale on PlanetScale only; commented out locally in 2024",
  },
  {
    index: "idx_user_organizations_tenant_id",
    table: "user_organizations",
    reason: "already dropped locally; may linger on PlanetScale",
  },
];

async function dropIndexSafe(
  db: Kysely<Database>,
  dbType: "mysql" | "sqlite",
  index: string,
  table: string,
): Promise<void> {
  try {
    if (dbType === "mysql") {
      await sql
        .raw(`DROP INDEX IF EXISTS \`${index}\` ON \`${table}\``)
        .execute(db);
    } else {
      await sql.raw(`DROP INDEX IF EXISTS "${index}"`).execute(db);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    migrationWarn(
      `  Warning: failed to drop index ${index} on ${table}: ${msg}`,
    );
  }
}

export async function up(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  for (const { index, table } of REDUNDANT_INDEXES) {
    await dropIndexSafe(db, dbType, index, table);
  }

  // Unused since the 2022 init migration; never referenced by application code.
  await db.schema.dropTable("members").ifExists().execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("members")
    .addColumn("id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("sub", "varchar(255)")
    .addColumn("email", "varchar(255)")
    .addColumn("name", "varchar(255)")
    .addColumn("status", "varchar(255)")
    .addColumn("role", "varchar(255)")
    .addColumn("picture", "varchar(2083)")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(255)", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("idx_user_organizations_tenant_id")
    .on("user_organizations")
    .column("tenant_id")
    .execute();

  await db.schema
    .createIndex("themes_tenant_id_idx")
    .on("themes")
    .column("tenant_id")
    .execute();

  await db.schema
    .createIndex("role_permissions_role_fk")
    .on("role_permissions")
    .columns(["tenant_id", "role_id"])
    .execute();

  await db.schema
    .createIndex("idx_organizations_tenant_id")
    .on("organizations")
    .column("tenant_id")
    .execute();

  await db.schema
    .createIndex("idx_invites_tenant_id")
    .on("invites")
    .column("tenant_id")
    .execute();

  await db.schema
    .createIndex("connections_tenant_id_idx")
    .on("connections")
    .column("tenant_id")
    .execute();
}
