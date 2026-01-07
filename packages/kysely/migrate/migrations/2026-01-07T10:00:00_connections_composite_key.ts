import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * Up migration: Change connections table to use composite primary key (tenant_id, id)
 * This allows the same connection id to exist across different tenants.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // 1. Remove foreign key constraint from keys table by recreating it
  // First, backup keys data
  const keys = await db.selectFrom("keys").selectAll().execute();

  await db.schema.dropTable("keys").execute();

  // 2. Rename the old connections table
  await sql`ALTER TABLE connections RENAME TO connections_old`.execute(db);

  // 3. Create the new connections table with composite primary key
  await db.schema
    .createTable("connections")
    .addColumn("id", "varchar(255)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("response_type", "varchar(255)")
    .addColumn("response_mode", "varchar(255)")
    .addColumn("strategy", "varchar(64)")
    .addColumn("options", "varchar(8192)", (col) =>
      col.defaultTo("{}").notNull(),
    )
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(255)", (col) => col.notNull())
    .addColumn("display_name", "varchar(255)")
    .addColumn("is_domain_connection", "integer")
    .addColumn("show_as_button", "integer")
    .addColumn("metadata", "varchar(4096)")
    .addColumn("is_system", "integer", (col) => col.defaultTo(0).notNull())
    .addPrimaryKeyConstraint("connections_pkey", ["tenant_id", "id"])
    .execute();

  // 4. Copy data from old table to new table
  await sql`
    INSERT INTO connections (
      id, tenant_id, name, response_type, response_mode, strategy, options,
      created_at, updated_at, display_name,
      is_domain_connection, show_as_button, metadata, is_system
    )
    SELECT 
      id, tenant_id, name, response_type, response_mode, strategy, options,
      created_at, updated_at, display_name,
      is_domain_connection, show_as_button, metadata, is_system
    FROM connections_old
  `.execute(db);

  // 5. Drop the old table
  await db.schema.dropTable("connections_old").execute();

  // 6. Create index on tenant_id for efficient queries
  await db.schema
    .createIndex("connections_tenant_id_idx")
    .on("connections")
    .column("tenant_id")
    .execute();

  // 7. Recreate the keys table with updated foreign key reference
  await db.schema
    .createTable("keys")
    .addColumn("kid", "varchar(255)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade"),
    )
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("revoked_at", "varchar(255)")
    .addColumn("cert", "varchar(4096)")
    .addColumn("pkcs7", "varchar(4096)")
    .addColumn("fingerprint", "varchar(256)")
    .addColumn("thumbprint", "varchar(256)")
    .addColumn("current_since", "varchar(256)")
    .addColumn("current_until", "varchar(256)")
    .addColumn("type", "varchar(50)", (col) =>
      col.notNull().defaultTo("jwt_signing"),
    )
    // connection is now just a varchar without FK constraint since we need composite key
    .addColumn("connection", "varchar(255)")
    .execute();

  // 8. Restore keys data
  for (const key of keys) {
    await db.insertInto("keys").values(key).execute();
  }
}

/**
 * Down migration: Restore connections table with single id primary key
 */
export async function down(db: Kysely<Database>): Promise<void> {
  // 1. Backup keys data and drop keys table
  const keys = await db.selectFrom("keys").selectAll().execute();
  await db.schema.dropTable("keys").execute();

  // 2. Rename current table
  await sql`ALTER TABLE connections RENAME TO connections_new`.execute(db);

  // 3. Create the old connections table with single primary key
  await db.schema
    .createTable("connections")
    .addColumn("id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("response_type", "varchar(255)")
    .addColumn("response_mode", "varchar(255)")
    .addColumn("strategy", "varchar(64)")
    .addColumn("options", "varchar(8192)", (col) =>
      col.defaultTo("{}").notNull(),
    )
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(255)", (col) => col.notNull())
    .addColumn("display_name", "varchar(255)")
    .addColumn("is_domain_connection", "integer")
    .addColumn("show_as_button", "integer")
    .addColumn("metadata", "varchar(4096)")
    .addColumn("is_system", "integer", (col) => col.defaultTo(0).notNull())
    .execute();

  // 4. Copy data back
  await sql`
    INSERT INTO connections (
      id, tenant_id, name, response_type, response_mode, strategy, options,
      created_at, updated_at, display_name,
      is_domain_connection, show_as_button, metadata, is_system
    )
    SELECT 
      id, tenant_id, name, response_type, response_mode, strategy, options,
      created_at, updated_at, display_name,
      is_domain_connection, show_as_button, metadata, is_system
    FROM connections_new
  `.execute(db);

  // 5. Drop the new table
  await db.schema.dropTable("connections_new").execute();

  // 6. Recreate index
  await db.schema
    .createIndex("connections_tenant_id_idx")
    .on("connections")
    .column("tenant_id")
    .execute();

  // 7. Recreate keys table with FK to connections
  await db.schema
    .createTable("keys")
    .addColumn("kid", "varchar(255)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade"),
    )
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("revoked_at", "varchar(255)")
    .addColumn("cert", "varchar(4096)")
    .addColumn("pkcs7", "varchar(4096)")
    .addColumn("fingerprint", "varchar(256)")
    .addColumn("thumbprint", "varchar(256)")
    .addColumn("current_since", "varchar(256)")
    .addColumn("current_until", "varchar(256)")
    .addColumn("type", "varchar(50)", (col) =>
      col.notNull().defaultTo("jwt_signing"),
    )
    .addColumn("connection", "varchar(255)", (col) =>
      col.references("connections.id").onDelete("cascade"),
    )
    .execute();

  // 8. Restore keys data
  for (const key of keys) {
    await db.insertInto("keys").values(key).execute();
  }
}
