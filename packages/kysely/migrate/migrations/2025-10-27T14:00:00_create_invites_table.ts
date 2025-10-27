import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Create invites table
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("invites")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
    .addColumn("organization_id", "varchar(21)", (col) => col.notNull())
    .addColumn("inviter", "text", (col) => col.notNull()) // JSON string
    .addColumn("invitee", "text", (col) => col.notNull()) // JSON string
    .addColumn("client_id", "varchar(191)", (col) => col.notNull())
    .addColumn("connection_id", "varchar(21)") // Optional
    .addColumn("invitation_url", "text", (col) => col.notNull())
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(35)", (col) => col.notNull())
    .addColumn("app_metadata", "text") // JSON string
    .addColumn("user_metadata", "text") // JSON string
    .addColumn("roles", "text") // JSON array string
    .addColumn("ticket_id", "varchar(191)") // Optional
    .addColumn("ttl_sec", "integer") // Optional
    .addColumn("send_invitation_email", "integer") // boolean as int
    .execute();

  // Add index on tenant_id for better query performance
  await db.schema
    .createIndex("idx_invites_tenant_id")
    .on("invites")
    .column("tenant_id")
    .execute();

  // Add index on organization_id for filtering by organization
  await db.schema
    .createIndex("idx_invites_organization_id")
    .on("invites")
    .column("organization_id")
    .execute();

  // Add index on expires_at for cleanup queries
  await db.schema
    .createIndex("idx_invites_expires_at")
    .on("invites")
    .column("expires_at")
    .execute();

  // Add composite index on (tenant_id, created_at) for listing queries
  await db.schema
    .createIndex("idx_invites_tenant_created")
    .on("invites")
    .columns(["tenant_id", "created_at"])
    .execute();
}

/**
 * Down migration: Drop invites table
 */
export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("invites").execute();
}
