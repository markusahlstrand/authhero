import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Adds `database_version` to the tenant row so the control plane can record the
 * schema version (the latest migration applied) the deployed WFP tenant worker
 * targets. Together with `worker_version` and `bundle_configuration` this lets
 * the control plane detect drift and drive upgrades. Nullable — shared tenants
 * and pre-existing WFP tenants land as `null` until their next (re)provision.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .addColumn("database_version", "varchar(64)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("tenants")
    .dropColumn("database_version")
    .execute();
}
