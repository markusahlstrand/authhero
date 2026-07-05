import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import {
  ListParams,
  ListRolloutsResult,
  Rollout,
  RolloutInsert,
  RolloutUpdate,
  RolloutsAdapter,
  rolloutInsertSchema,
  rolloutSchema,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

type RolloutRow = Database["rollouts"];

function parseJsonColumn(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function rowToRollout(row: RolloutRow): Rollout {
  return rolloutSchema.parse({
    id: row.id,
    kind: row.kind,
    status: row.status,
    target_worker_version: row.target_worker_version,
    target_database_version: row.target_database_version,
    wave_size: row.wave_size,
    canary_tenant_ids: parseJsonColumn(row.canary_tenant_ids),
    filter: parseJsonColumn(row.filter),
    initiated_by: row.initiated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    finished_at: row.finished_at,
  });
}

export function createRolloutsAdapter(db: Kysely<Database>): RolloutsAdapter {
  return {
    async create(rollout: RolloutInsert): Promise<Rollout> {
      const input = rolloutInsertSchema.parse(rollout);
      const now = new Date().toISOString();
      const row: RolloutRow = {
        id: `rol_${nanoid()}`,
        kind: input.kind,
        status: "pending",
        target_worker_version: input.target_worker_version ?? null,
        target_database_version: input.target_database_version ?? null,
        wave_size: input.wave_size,
        canary_tenant_ids: input.canary_tenant_ids
          ? JSON.stringify(input.canary_tenant_ids)
          : null,
        filter: input.filter ? JSON.stringify(input.filter) : null,
        initiated_by: input.initiated_by ?? null,
        created_at: now,
        updated_at: now,
        finished_at: null,
      };

      await db.insertInto("rollouts").values(row).execute();

      return rowToRollout(row);
    },

    async get(id: string): Promise<Rollout | null> {
      const row = await db
        .selectFrom("rollouts")
        .where("id", "=", id)
        .selectAll()
        .executeTakeFirst();
      return row ? rowToRollout(row) : null;
    },

    async list(params: ListParams = {}): Promise<ListRolloutsResult> {
      const page = params.page ?? 0;
      const per_page = params.per_page ?? 50;

      const rows = await db
        .selectFrom("rollouts")
        .selectAll()
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .offset(page * per_page)
        .limit(per_page)
        .execute();

      return {
        rollouts: rows.map(rowToRollout),
        start: page * per_page,
        limit: per_page,
        length: rows.length,
      };
    },

    async update(id: string, rollout: RolloutUpdate): Promise<boolean> {
      const set: Partial<RolloutRow> = {
        updated_at: new Date().toISOString(),
      };
      if (rollout.status !== undefined) set.status = rollout.status;
      if (rollout.wave_size !== undefined) set.wave_size = rollout.wave_size;
      if (rollout.canary_tenant_ids !== undefined)
        set.canary_tenant_ids = rollout.canary_tenant_ids
          ? JSON.stringify(rollout.canary_tenant_ids)
          : null;
      if (rollout.filter !== undefined)
        set.filter = rollout.filter ? JSON.stringify(rollout.filter) : null;
      if (rollout.finished_at !== undefined)
        set.finished_at = rollout.finished_at;

      const result = await db
        .updateTable("rollouts")
        .where("id", "=", id)
        .set(set)
        .executeTakeFirst();

      return Number(result.numUpdatedRows) > 0;
    },

    async remove(id: string): Promise<boolean> {
      const result = await db
        .deleteFrom("rollouts")
        .where("id", "=", id)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },
  };
}
