import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

/**
 * SCIM 2.0 inbound provisioning (#1191). Three tenant-scoped tables:
 *
 *   - scim_configurations: one config per connection.
 *   - scim_tokens: hashed long-lived bearer tokens for /scim/v2.
 *   - scim_external_ids: IdP externalId -> AuthHero user_id lookup.
 *
 * Every primary/unique key leads with `tenant_id`: connection ids, token ids
 * and IdP external ids are only unique within a tenant, so a tenant-less key
 * would let one tenant's row block another's.
 *
 * No foreign keys, mirroring `proxy_routes`: connections have a composite
 * (tenant_id, id) primary key, so a real FK would be composite and awkward,
 * and these tables are always queried tenant-scoped anyway. `mapping` and
 * `scopes` are JSON text with no DB-level default (MySQL forbids defaults on
 * TEXT); the adapter always writes a value.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("scim_configurations")
    .addColumn("connection_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("user_id_attribute", sql`varchar(255)`, (col) =>
      col.notNull().defaultTo("externalId"),
    )
    .addColumn("mapping", sql`text`, (col) => col.notNull())
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("updated_at", sql`varchar(35)`, (col) => col.notNull())
    .addPrimaryKeyConstraint("scim_configurations_pk", [
      "tenant_id",
      "connection_id",
    ])
    .execute();

  await db.schema
    .createTable("scim_tokens")
    .addColumn("token_id", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("connection_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("token_hash", sql`varchar(128)`, (col) => col.notNull())
    .addColumn("scopes", sql`text`, (col) => col.notNull())
    .addColumn("valid_until", sql`varchar(35)`)
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addColumn("last_used_at", sql`varchar(35)`)
    .addPrimaryKeyConstraint("scim_tokens_pk", ["tenant_id", "token_id"])
    .execute();

  await db.schema
    .createIndex("scim_tokens_tenant_connection_idx")
    .on("scim_tokens")
    .columns(["tenant_id", "connection_id"])
    .execute();

  await db.schema
    .createIndex("scim_tokens_tenant_hash_idx")
    .on("scim_tokens")
    .columns(["tenant_id", "token_hash"])
    .unique()
    .execute();

  await db.schema
    .createTable("scim_external_ids")
    .addColumn("tenant_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("connection_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("external_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("user_id", sql`varchar(255)`, (col) => col.notNull())
    .addColumn("created_at", sql`varchar(35)`, (col) => col.notNull())
    .addPrimaryKeyConstraint("scim_external_ids_pk", [
      "tenant_id",
      "connection_id",
      "user_id",
    ])
    .execute();

  await db.schema
    .createIndex("scim_external_ids_connection_external_idx")
    .on("scim_external_ids")
    .columns(["tenant_id", "connection_id", "external_id"])
    .unique()
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("scim_external_ids").ifExists().execute();
  await db.schema.dropTable("scim_tokens").ifExists().execute();
  await db.schema.dropTable("scim_configurations").ifExists().execute();
}
