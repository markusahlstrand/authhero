import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Adds tenant-level provisioning / deployment metadata so a tenant row can
 * describe whether it runs on the shared authhero deployment or as its own
 * worker in a Cloudflare dispatch namespace, and what bundle / storage
 * backing it uses. `deployment_type` and `provisioning_state` get DB
 * defaults so existing rows land as `shared` / `ready` with no app change.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .addColumn("deployment_type", "varchar(16)", (col) =>
      col.notNull().defaultTo("shared"),
    )
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("provisioning_state", "varchar(16)", (col) =>
      col.notNull().defaultTo("ready"),
    )
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("provisioning_error", "varchar(2048)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("provisioning_state_changed_at", "varchar(35)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("bundle_configuration", "varchar(64)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("worker_version", "varchar(64)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("worker_script_name", "varchar(255)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("storage_kind", "varchar(32)")
    .execute();

  await db.schema
    .alterTable("tenants")
    .addColumn("d1_database_id", "varchar(64)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("tenants").dropColumn("d1_database_id").execute();
  await db.schema.alterTable("tenants").dropColumn("storage_kind").execute();
  await db.schema
    .alterTable("tenants")
    .dropColumn("worker_script_name")
    .execute();
  await db.schema.alterTable("tenants").dropColumn("worker_version").execute();
  await db.schema
    .alterTable("tenants")
    .dropColumn("bundle_configuration")
    .execute();
  await db.schema
    .alterTable("tenants")
    .dropColumn("provisioning_state_changed_at")
    .execute();
  await db.schema
    .alterTable("tenants")
    .dropColumn("provisioning_error")
    .execute();
  await db.schema
    .alterTable("tenants")
    .dropColumn("provisioning_state")
    .execute();
  await db.schema.alterTable("tenants").dropColumn("deployment_type").execute();
}
