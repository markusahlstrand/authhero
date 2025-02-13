import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("sessions")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(255)")
    .addColumn("user_id", "varchar(255)")
    // same change here as on other tables - FK reference needed to users table
    .addForeignKeyConstraint(
      "user_id_constraint",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(35)")
    .addColumn("idle_expires_at", "varchar(35)")
    .addColumn("authenticated_at", "varchar(35)")
    .addColumn("last_interaction_at", "varchar(35)")
    .addColumn("used_at", "varchar(35)")
    .addColumn("revoked_at", "varchar(35)")
    // Contains a json blob with user agents.
    .addColumn("device", "varchar(2048)", (col) => col.notNull())
    // Contains a json array with client ids.
    .addColumn("clients", "varchar(1024)", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("tickets")
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("client_id", "varchar(255)", (col) =>
      col.references("applications.id").onDelete("cascade").notNull(),
    )
    .addColumn("email", "varchar(255)", (col) => col.notNull())
    .addColumn("nonce", "varchar(255)")
    .addColumn("state", "varchar(1024)")
    .addColumn("scope", "varchar(1024)")
    .addColumn("response_type", "varchar(256)")
    .addColumn("response_mode", "varchar(256)")
    .addColumn("redirect_uri", "varchar(1024)")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(255)", (col) => col.notNull())
    .addColumn("used_at", "varchar(255)")
    .execute();

  await db.schema
    .createTable("otps")
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("client_id", "varchar(255)", (col) =>
      col.references("applications.id").onDelete("cascade").notNull(),
    )
    .addColumn("code", "varchar(255)", (col) => col.notNull())
    .addColumn("email", "varchar(255)", (col) => col.notNull())
    .addColumn("user_id", "varchar(255)")
    .addColumn("send", "varchar(255)")
    .addColumn("nonce", "varchar(255)")
    .addColumn("state", "varchar(1024)")
    .addColumn("scope", "varchar(1024)")
    .addColumn("response_type", "varchar(256)")
    .addColumn("response_mode", "varchar(256)")
    .addColumn("redirect_uri", "varchar(1024)")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("expires_at", "varchar(255)", (col) => col.notNull())
    .addColumn("used_at", "varchar(255)")
    .execute();

  await db.schema
    .createIndex("otps_email_index")
    .on("otps")
    .column("email")
    .execute();

  await db.schema
    .createIndex("otps_expires_at_index")
    .on("otps")
    .column("expires_at")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("sessions").execute();
  await db.schema.dropTable("tickets").execute();
  await db.schema.dropTable("otps").execute();
}
