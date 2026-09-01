import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import {
  ListTenantOperationsParams,
  ListTenantOperationsResult,
  TenantOperation,
  TenantOperationInsert,
  TenantOperationKind,
  TenantOperationUpdate,
  TenantOperationsAdapter,
  tenantOperationInsertSchema,
  tenantOperationSchema,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

type TenantOperationRow = Database["tenant_operations"];

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed));
    }
  } catch {
    /* fall through */
  }
  return null;
}

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
    input: parseJsonObject(row.input),
    result: parseJsonObject(row.result),
    claimed_by: row.claimed_by,
    claim_expires_at: row.claim_expires_at,
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
        input: input.input ? JSON.stringify(input.input) : null,
        result: null,
        claimed_by: null,
        claim_expires_at: null,
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
      if (operation.result !== undefined)
        set.result = operation.result ? JSON.stringify(operation.result) : null;
      if (operation.claimed_by !== undefined)
        set.claimed_by = operation.claimed_by;
      if (operation.claim_expires_at !== undefined)
        set.claim_expires_at = operation.claim_expires_at;
      if (operation.finished_at !== undefined)
        set.finished_at = operation.finished_at;

      const result = await db
        .updateTable("tenant_operations")
        .where("id", "=", id)
        .set(set)
        .executeTakeFirst();

      return Number(result.numUpdatedRows) > 0;
    },

    async claim(
      id: string,
      worker_id: string,
      leaseMs: number,
    ): Promise<boolean> {
      const now = new Date();
      const nowIso = now.toISOString();
      const expires = new Date(now.getTime() + leaseMs).toISOString();

      // One conditional statement: free lease, expired lease, or a lease this
      // same worker already holds (re-claim is a no-op that extends it).
      await db
        .updateTable("tenant_operations")
        .where("id", "=", id)
        .where((eb) =>
          eb.or([
            eb("claimed_by", "is", null),
            eb("claim_expires_at", "<=", nowIso),
            eb("claimed_by", "=", worker_id),
          ]),
        )
        .set({
          claimed_by: worker_id,
          claim_expires_at: expires,
          updated_at: nowIso,
        })
        .executeTakeFirst();

      // MySQL reports 0 changed rows when the UPDATE is a no-op (same worker,
      // same values), so the read-back — not numUpdatedRows — decides.
      const row = await db
        .selectFrom("tenant_operations")
        .where("id", "=", id)
        .select(["claimed_by"])
        .executeTakeFirst();

      return row?.claimed_by === worker_id;
    },

    async release(id: string, worker_id: string): Promise<boolean> {
      const result = await db
        .updateTable("tenant_operations")
        .where("id", "=", id)
        .where("claimed_by", "=", worker_id)
        .set({
          claimed_by: null,
          claim_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .executeTakeFirst();

      return Number(result.numUpdatedRows) > 0;
    },

    async listResumable(params: {
      kind: TenantOperationKind;
      limit: number;
    }): Promise<TenantOperation[]> {
      const nowIso = new Date().toISOString();

      const rows = await db
        .selectFrom("tenant_operations")
        .where("kind", "=", params.kind)
        .where("status", "in", ["pending", "running"])
        .where((eb) =>
          eb.or([
            eb("claimed_by", "is", null),
            eb("claim_expires_at", "<=", nowIso),
          ]),
        )
        .selectAll()
        .orderBy("created_at", "asc")
        .orderBy("id", "asc")
        .limit(params.limit)
        .execute();

      return rows.map(rowToTenantOperation);
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
