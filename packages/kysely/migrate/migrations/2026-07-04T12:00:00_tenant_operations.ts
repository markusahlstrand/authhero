import { Kysely } from "kysely";

/**
 * Durable tenant lifecycle operations with append-only history, plus fleet
 * rollouts (issue #1026). `tenant_operations` intentionally has no FK to
 * `tenants`: the log must survive tenant deletion and `tenant_id` is NULL
 * for fleet-level operations.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("tenant_operations")
    .ifNotExists()
    .addColumn("id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("tenant_id", "varchar(255)")
    .addColumn("rollout_id", "varchar(255)")
    .addColumn("kind", "varchar(32)", (col) => col.notNull())
    .addColumn("status", "varchar(32)", (col) => col.notNull())
    .addColumn("current_step", "varchar(255)")
    .addColumn("engine", "varchar(64)", (col) => col.notNull())
    .addColumn("engine_instance_id", "varchar(100)")
    .addColumn("target_worker_version", "varchar(255)")
    .addColumn("target_database_version", "varchar(255)")
    .addColumn("error", "text")
    .addColumn("initiated_by", "varchar(255)")
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addColumn("finished_at", "varchar(35)")
    .execute();

  await db.schema
    .createIndex("tenant_operations_tenant_id_created_at_idx")
    .on("tenant_operations")
    .columns(["tenant_id", "created_at"])
    .execute();

  await db.schema
    .createIndex("tenant_operations_rollout_id_idx")
    .on("tenant_operations")
    .column("rollout_id")
    .execute();

  await db.schema
    .createIndex("tenant_operations_status_idx")
    .on("tenant_operations")
    .column("status")
    .execute();

  await db.schema
    .createTable("tenant_operation_events")
    .ifNotExists()
    .addColumn("id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("operation_id", "varchar(255)", (col) => col.notNull())
    .addColumn("step", "varchar(255)", (col) => col.notNull())
    .addColumn("outcome", "varchar(32)", (col) => col.notNull())
    .addColumn("detail", "text")
    .addColumn("attempt", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addForeignKeyConstraint(
      "tenant_operation_events_operation_id_constraint",
      ["operation_id"],
      "tenant_operations",
      ["id"],
      (cb) => cb.onDelete("cascade"),
    )
    .execute();

  await db.schema
    .createIndex("tenant_operation_events_operation_id_created_at_idx")
    .on("tenant_operation_events")
    .columns(["operation_id", "created_at"])
    .execute();

  await db.schema
    .createTable("rollouts")
    .ifNotExists()
    .addColumn("id", "varchar(255)", (col) => col.notNull().primaryKey())
    .addColumn("kind", "varchar(32)", (col) => col.notNull())
    .addColumn("status", "varchar(32)", (col) => col.notNull())
    .addColumn("target_worker_version", "varchar(255)")
    .addColumn("target_database_version", "varchar(255)")
    .addColumn("wave_size", "integer", (col) => col.notNull().defaultTo(10))
    .addColumn("canary_tenant_ids", "text")
    .addColumn("filter", "text")
    .addColumn("initiated_by", "varchar(255)")
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addColumn("finished_at", "varchar(35)")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("tenant_operation_events").ifExists().execute();
  await db.schema.dropTable("tenant_operations").ifExists().execute();
  await db.schema.dropTable("rollouts").ifExists().execute();
}
