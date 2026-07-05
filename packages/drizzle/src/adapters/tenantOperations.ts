import { and, desc, eq, inArray, lt, SQL } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  ListTenantOperationsParams,
  ListTenantOperationsResult,
  TenantOperation,
  TenantOperationInsert,
  TenantOperationUpdate,
  TenantOperationsAdapter,
} from "@authhero/adapter-interfaces";
import {
  tenantOperationInsertSchema,
  tenantOperationSchema,
} from "@authhero/adapter-interfaces";
import { tenantOperations } from "../schema/control-plane";
import type { DrizzleDb } from "./types";

function rowToTenantOperation(
  row: typeof tenantOperations.$inferSelect,
): TenantOperation {
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
  db: DrizzleDb,
): TenantOperationsAdapter {
  return {
    async create(operation: TenantOperationInsert): Promise<TenantOperation> {
      const input = tenantOperationInsertSchema.parse(operation);
      const now = new Date().toISOString();
      const row: typeof tenantOperations.$inferInsert = {
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

      await db.insert(tenantOperations).values(row);

      const created = await this.get(row.id);
      if (!created) {
        throw new Error(`Failed to create tenant operation ${row.id}`);
      }
      return created;
    },

    async get(id: string): Promise<TenantOperation | null> {
      const rows = await db
        .select()
        .from(tenantOperations)
        .where(eq(tenantOperations.id, id))
        .limit(1);
      return rows[0] ? rowToTenantOperation(rows[0]) : null;
    },

    async list(
      params: ListTenantOperationsParams = {},
    ): Promise<ListTenantOperationsResult> {
      const page = params.page ?? 0;
      const per_page = params.per_page ?? 50;

      const conditions: SQL[] = [];
      if (params.tenant_id !== undefined) {
        conditions.push(eq(tenantOperations.tenant_id, params.tenant_id));
      }
      if (params.rollout_id !== undefined) {
        conditions.push(eq(tenantOperations.rollout_id, params.rollout_id));
      }
      if (params.kind !== undefined) {
        conditions.push(eq(tenantOperations.kind, params.kind));
      }
      if (params.status !== undefined) {
        const statuses = Array.isArray(params.status)
          ? params.status
          : [params.status];
        conditions.push(inArray(tenantOperations.status, statuses));
      }
      if (params.engine !== undefined) {
        conditions.push(eq(tenantOperations.engine, params.engine));
      }
      if (params.updated_before !== undefined) {
        conditions.push(lt(tenantOperations.updated_at, params.updated_before));
      }

      const rows = await db
        .select()
        .from(tenantOperations)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(tenantOperations.created_at), desc(tenantOperations.id))
        .offset(page * per_page)
        .limit(per_page);

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
      const existing = await db
        .select({ id: tenantOperations.id })
        .from(tenantOperations)
        .where(eq(tenantOperations.id, id))
        .limit(1);
      if (existing.length === 0) return false;

      const set: Partial<typeof tenantOperations.$inferInsert> = {
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

      await db
        .update(tenantOperations)
        .set(set)
        .where(eq(tenantOperations.id, id));
      return true;
    },

    async remove(id: string): Promise<boolean> {
      const existing = await db
        .select({ id: tenantOperations.id })
        .from(tenantOperations)
        .where(eq(tenantOperations.id, id))
        .limit(1);
      if (existing.length === 0) return false;

      await db.delete(tenantOperations).where(eq(tenantOperations.id, id));
      return true;
    },
  };
}
