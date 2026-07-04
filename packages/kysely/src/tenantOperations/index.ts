import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import {
  ListTenantOperationsParams,
  ListTenantOperationsResult,
  TenantOperation,
  TenantOperationInsert,
  TenantOperationUpdate,
  TenantOperationsAdapter,
  tenantOperationInsertSchema,
  tenantOperationSchema,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

type TenantOperationRow = Database["tenant_operations"];

function rowToTenantOperation(row: TenantOperationRow): TenantOperation {
  return tenantOperationSchema.parse({
    id: row.id,
    tenant_id: row.tenant_id,
    rollout_id: row.rollout_id,
    kind: row.kind,
    status: row.status,
    current_step: row.current_step,
    engine: row.engine,
    engine_instance_id: row.engine_instance_id,
    target_worker_version: row.target_worker_version,
    target_database_version: row.target_database_version,
    error: row.error,
    initiated_by: row.initiated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    finished_at: row.finished_at,
  });
}

export function createTenantOperationsAdapter(
  db: Kysely<Database>,
): TenantOperationsAdapter {
  return {
    async create(operation: TenantOperationInsert): Promise<TenantOperation> {
      const input = tenantOperationInsertSchema.parse(operation);
      const now = new Date().toISOString();
      const row: TenantOperationRow = {
        id: `op_${nanoid()}`,
        tenant_id: input.tenant_id,
        rollout_id: input.rollout_id ?? null,
        kind: input.kind,
        status: "pending",
        current_step: null,
        engine: input.engine,
        engine_instance_id: input.engine_instance_id ?? null,
        target_worker_version: input.target_worker_version ?? null,
        target_database_version: input.target_database_version ?? null,
        error: null,
        initiated_by: input.initiated_by ?? null,
        created_at: now,
        updated_at: now,
        finished_at: null,
      };

      await db.insertInto("tenant_operations").values(row).execute();

      return rowToTenantOperation(row);
    },

    async get(id: string): Promise<TenantOperation | null> {
      const row = await db
        .selectFrom("tenant_operations")
        .where("id", "=", id)
        .selectAll()
        .executeTakeFirst();
      return row ? rowToTenantOperation(row) : null;
    },

    async list(
      params: ListTenantOperationsParams = {},
    ): Promise<ListTenantOperationsResult> {
      const page = params.page ?? 0;
      const per_page = params.per_page ?? 50;

      let query = db.selectFrom("tenant_operations");

      if (params.tenant_id !== undefined) {
        query = query.where("tenant_id", "=", params.tenant_id);
      }
      if (params.rollout_id !== undefined) {
        query = query.where("rollout_id", "=", params.rollout_id);
      }
      if (params.kind !== undefined) {
        query = query.where("kind", "=", params.kind);
      }
      if (params.status !== undefined) {
        const statuses = Array.isArray(params.status)
          ? params.status
          : [params.status];
        query = query.where("status", "in", statuses);
      }
      if (params.engine !== undefined) {
        query = query.where("engine", "=", params.engine);
      }
      if (params.updated_before !== undefined) {
        query = query.where("updated_at", "<", params.updated_before);
      }

      const rows = await query
        .selectAll()
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .offset(page * per_page)
        .limit(per_page)
        .execute();

      return {
        operations: rows.map(rowToTenantOperation),
        start: page * per_page,
        limit: per_page,
        length: rows.length,
      };
    },

    async update(
      id: string,
      operation: TenantOperationUpdate,
    ): Promise<boolean> {
      const set: Partial<TenantOperationRow> = {
        updated_at: new Date().toISOString(),
      };
      if (operation.status !== undefined) set.status = operation.status;
      if (operation.current_step !== undefined)
        set.current_step = operation.current_step;
      if (operation.engine_instance_id !== undefined)
        set.engine_instance_id = operation.engine_instance_id;
      if (operation.target_worker_version !== undefined)
        set.target_worker_version = operation.target_worker_version;
      if (operation.target_database_version !== undefined)
        set.target_database_version = operation.target_database_version;
      if (operation.error !== undefined) set.error = operation.error;
      if (operation.finished_at !== undefined)
        set.finished_at = operation.finished_at;

      const result = await db
        .updateTable("tenant_operations")
        .where("id", "=", id)
        .set(set)
        .executeTakeFirst();

      return Number(result.numUpdatedRows) > 0;
    },

    async remove(id: string): Promise<boolean> {
      const result = await db
        .deleteFrom("tenant_operations")
        .where("id", "=", id)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },
  };
}
