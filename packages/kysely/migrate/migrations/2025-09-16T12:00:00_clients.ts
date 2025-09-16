import { Database } from "../../src/db";
import { Kysely } from "kysely";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("clients")
    .addColumn("client_id", "varchar(191)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(191)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("description", "varchar(140)")
    .addColumn("global", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("client_secret", "varchar(255)")
    .addColumn("app_type", "varchar(64)", (col) => col.defaultTo("regular_web"))
    .addColumn("logo_uri", "varchar(2083)")
    .addColumn("is_first_party", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("oidc_conformant", "integer", (col) =>
      col.defaultTo(1).notNull(),
    )
    .addColumn("callbacks", "text", (col) => col.defaultTo("[]").notNull())
    .addColumn("allowed_origins", "text", (col) =>
      col.defaultTo("[]").notNull(),
    )
    .addColumn("web_origins", "text", (col) => col.defaultTo("[]").notNull())
    .addColumn("client_aliases", "text", (col) => col.defaultTo("[]").notNull())
    .addColumn("allowed_clients", "text", (col) =>
      col.defaultTo("[]").notNull(),
    )
    .addColumn("allowed_logout_urls", "text", (col) =>
      col.defaultTo("[]").notNull(),
    )
    .addColumn("session_transfer", "text", (col) =>
      col.defaultTo("{}").notNull(),
    )
    .addColumn("oidc_logout", "text", (col) => col.defaultTo("{}").notNull())
    .addColumn("grant_types", "text", (col) => col.defaultTo("[]").notNull())
    .addColumn("jwt_configuration", "text", (col) =>
      col.defaultTo("{}").notNull(),
    )
    .addColumn("signing_keys", "text", (col) => col.defaultTo("[]").notNull())
    .addColumn("encryption_key", "text", (col) => col.defaultTo("{}").notNull())
    .addColumn("sso", "integer", (col) => col.defaultTo(0).notNull())
    .addColumn("sso_disabled", "integer", (col) => col.defaultTo(1).notNull())
    .addColumn("cross_origin_authentication", "integer", (col) =>
      col.defaultTo(0).notNull(),
    )
    .addColumn("cross_origin_loc", "varchar(2083)")
    .addColumn("custom_login_page_on", "integer", (col) =>
      col.defaultTo(0).notNull(),
    )
    .addColumn("custom_login_page", "text")
    .addColumn("custom_login_page_preview", "text")
    .addColumn("form_template", "text")
    .addColumn("addons", "text", (col) => col.defaultTo("{}").notNull())
    .addColumn("token_endpoint_auth_method", "varchar(64)", (col) =>
      col.defaultTo("client_secret_basic"),
    )
    .addColumn("client_metadata", "text", (col) =>
      col.defaultTo("{}").notNull(),
    )
    .addColumn("mobile", "text", (col) => col.defaultTo("{}").notNull())
    .addColumn("initiate_login_uri", "varchar(2083)")
    .addColumn("native_social_login", "text", (col) =>
      col.defaultTo("{}").notNull(),
    )
    .addColumn("refresh_token", "text", (col) => col.defaultTo("{}").notNull())
    .addColumn("default_organization", "text", (col) =>
      col.defaultTo("{}").notNull(),
    )
    .addColumn("organization_usage", "varchar(32)", (col) =>
      col.defaultTo("deny"),
    )
    .addColumn("organization_require_behavior", "varchar(32)", (col) =>
      col.defaultTo("no_prompt"),
    )
    .addColumn("client_authentication_methods", "text", (col) =>
      col.defaultTo("{}").notNull(),
    )
    .addColumn("require_pushed_authorization_requests", "integer", (col) =>
      col.defaultTo(0).notNull(),
    )
    .addColumn("require_proof_of_possession", "integer", (col) =>
      col.defaultTo(0).notNull(),
    )
    .addColumn("signed_request_object", "text", (col) =>
      col.defaultTo("{}").notNull(),
    )
    .addColumn("compliance_level", "varchar(64)")
    .addColumn("par_request_expiry", "integer")
    .addColumn("token_quota", "text", (col) => col.defaultTo("{}").notNull())
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addPrimaryKeyConstraint("clients_tenant_id_client_id", [
      "tenant_id",
      "client_id",
    ])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("clients").execute();
}
