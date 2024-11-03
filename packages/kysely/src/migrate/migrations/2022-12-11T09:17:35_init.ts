import { Database } from "@authhero/kysely-adapter";
import { Kysely } from "kysely";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("tenants")
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("name", "varchar(255)")
    .addColumn("audience", "varchar(255)")
    .addColumn("sender_email", "varchar(255)")
    .addColumn("sender_name", "varchar(255)")
    .addColumn("language", "varchar(255)")
    .addColumn("logo", "varchar(255)")
    .addColumn("primary_color", "varchar(255)")
    .addColumn("secondary_color", "varchar(255)")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("modified_at", "varchar(255)", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("users")
    .addColumn("user_id", "varchar(255)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("email", "varchar(255)", (col) => col.notNull())
    .addColumn("given_name", "varchar(255)")
    .addColumn("family_name", "varchar(255)")
    .addColumn("nickname", "varchar(255)")
    .addColumn("name", "varchar(255)")
    .addColumn("picture", "varchar(2083)")
    .addColumn("tags", "varchar(255)")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("modified_at", "varchar(255)", (col) => col.notNull())
    .addPrimaryKeyConstraint("users_tenants", ["user_id", "tenant_id"])
    .addColumn("linked_to", "varchar(255)")
    .addForeignKeyConstraint(
      "linked_to_constraint",
      ["linked_to", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
    )
    .addColumn("last_ip", "varchar(255)")
    .addColumn("login_count", "integer", (col) => col.notNull())
    .addColumn("last_login", "varchar(255)")
    .addColumn("provider", "varchar(255)", (col) => col.notNull())
    .addColumn("connection", "varchar(255)")
    .addColumn("email_verified", "boolean", (col) => col.notNull())
    .addColumn("is_social", "boolean", (col) => col.notNull())
    .addColumn("app_metadata", "varchar(4096)", (col) =>
      col.defaultTo("{}").notNull(),
    )
    .addColumn("user_metadata", "varchar(4096)", (col) =>
      col.defaultTo("{}").notNull(),
    )
    .addUniqueConstraint("unique_email_provider", [
      "email",
      "provider",
      "tenant_id",
    ])
    .execute();

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
    // Changed to 2083 in later migration
    // .addColumn("picture", "varchar(255)")
    .addColumn("picture", "varchar(2083)")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("modified_at", "varchar(255)", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("applications")
    .addColumn("id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("client_secret", "varchar(255)")
    .addColumn("allowed_logout_urls", "varchar(255)")
    .addColumn("authentication_settings", "varchar(255)")
    .addColumn("addons", "varchar(4096)", (col) =>
      col.notNull().defaultTo("{}"),
    )
    .addColumn("callbacks", "varchar(1024)", (col) =>
      col.notNull().defaultTo("[]"),
    )
    .addColumn("allowed_origins", "varchar(1024)", (col) =>
      col.notNull().defaultTo("[]"),
    )
    .addColumn("web_origins", "varchar(1024)", (col) =>
      col.notNull().defaultTo("[]"),
    )
    .addColumn("allowed_clients", "varchar(1024)", (col) =>
      col.defaultTo("[]").notNull(),
    )
    .addColumn("options_kid", "varchar(32)")
    .addColumn("options_team_id", "varchar(32)")
    .addColumn("options_client_id", "varchar(128)")
    .addColumn("options_client_secret", "varchar(255)")
    .addColumn("options_scope", "varchar(255)")
    .addColumn("options_realms", "varchar(255)")
    .addColumn("options_app_secret", "varchar(1024)")
    .addColumn("email_validation", "varchar(255)")
    .addColumn("disable_sign_ups", "boolean", (col) => col.notNull())
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("modified_at", "varchar(255)", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("connections")
    .addColumn("id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("response_type", "varchar(255)")
    .addColumn("response_mode", "varchar(255)")
    .addColumn("options", "varchar(2048)", (col) =>
      col.defaultTo("{}").notNull(),
    )
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("modified_at", "varchar(255)", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("migrations")
    .addColumn("id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("provider", "varchar(255)")
    .addColumn("client_id", "varchar(255)")
    .addColumn("origin", "varchar(255)")
    .addColumn("domain", "varchar(255)")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("modified_at", "varchar(255)", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("domains")
    .addColumn("id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("domain", "varchar(255)", (col) => col.notNull())
    .addColumn("email_service", "varchar(255)")
    .addColumn("email_api_key", "varchar(255)")
    .addColumn("dkim_private_key", "varchar(2048)")
    .addColumn("dkim_public_key", "varchar(2048)")
    .addColumn("created_at", "varchar(255)", (col) => col.notNull())
    .addColumn("modified_at", "varchar(255)", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("domains").execute();
  await db.schema.dropTable("members").execute();
  await db.schema.dropTable("users").execute();
  await db.schema.dropTable("connections").execute();
  await db.schema.dropTable("applications").execute();
  await db.schema.dropTable("migrations").execute();
  await db.schema.dropTable("tenants").execute();
}
