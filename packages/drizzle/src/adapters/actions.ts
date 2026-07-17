import { eq, and, count as countFn, asc, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  Action,
  ActionInsert,
  ActionUpdate,
  ActionsAdapter,
  ListParams,
  ListActionsResponse,
} from "@authhero/adapter-interfaces";
import { actions } from "../schema/sqlite";
import { parseJsonIfString } from "../helpers/transform";
import { buildLuceneFilter } from "../helpers/filter";
import type { DrizzleDb } from "./types";

type StoredSecret = { name: string; value?: string };

function parseStoredSecrets(raw: string | null | undefined): StoredSecret[] {
  const parsed = parseJsonIfString<StoredSecret[]>(raw);
  return Array.isArray(parsed) ? parsed : [];
}

// Maps a DB row to the adapter `Action` shape: parses JSON columns, converts
// epoch-ms `_ts` columns to ISO strings and integer flags to booleans. Mirrors
// the kysely adapter so both backends return identical objects.
function rowToAction(row: any): Action {
  const {
    created_at_ts,
    updated_at_ts,
    deployed_at_ts,
    secrets,
    dependencies,
    supported_triggers,
    is_system,
    inherit,
    tenant_id,
    runtime,
    status,
    ...rest
  } = row;

  return {
    ...rest,
    tenant_id,
    runtime: runtime ?? undefined,
    status: (status as "draft" | "built") || "built",
    deployed_at: deployed_at_ts
      ? new Date(Number(deployed_at_ts)).toISOString()
      : undefined,
    secrets:
      parseJsonIfString<Array<{ name: string; value?: string }>>(secrets),
    dependencies:
      parseJsonIfString<Array<{ name: string; version: string }>>(dependencies),
    supported_triggers:
      parseJsonIfString<Array<{ id: string; version?: string }>>(
        supported_triggers,
      ),
    is_system: !!is_system,
    inherit: !!inherit,
    created_at: new Date(Number(created_at_ts)).toISOString(),
    updated_at: new Date(Number(updated_at_ts)).toISOString(),
  } as Action;
}

export function createActionsAdapter(db: DrizzleDb): ActionsAdapter {
  return {
    async create(tenant_id: string, action: ActionInsert): Promise<Action> {
      const now = Date.now();
      const id = `act_${nanoid()}`;

      await db.insert(actions).values({
        id,
        tenant_id,
        name: action.name,
        code: action.code,
        runtime: action.runtime ?? null,
        status: "built",
        secrets: action.secrets ? JSON.stringify(action.secrets) : null,
        dependencies: action.dependencies
          ? JSON.stringify(action.dependencies)
          : null,
        supported_triggers: action.supported_triggers
          ? JSON.stringify(action.supported_triggers)
          : null,
        is_system: action.is_system ? 1 : 0,
        inherit: action.inherit ? 1 : 0,
        created_at_ts: now,
        updated_at_ts: now,
      });

      return {
        id,
        tenant_id,
        name: action.name,
        code: action.code,
        runtime: action.runtime,
        status: "built",
        // Responses expose secret names only, never the stored values.
        secrets: action.secrets?.map((s) => ({ name: s.name })),
        dependencies: action.dependencies,
        supported_triggers: action.supported_triggers,
        is_system: action.is_system ?? false,
        inherit: action.inherit ?? false,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      };
    },

    async get(tenant_id: string, action_id: string): Promise<Action | null> {
      const row = await db
        .select()
        .from(actions)
        .where(and(eq(actions.tenant_id, tenant_id), eq(actions.id, action_id)))
        .get();

      return row ? rowToAction(row) : null;
    },

    async list(
      tenant_id: string,
      params: ListParams = {},
    ): Promise<ListActionsResponse> {
      const {
        page = 0,
        per_page = 50,
        include_totals = false,
        sort,
        q,
      } = params;

      const conditions = [eq(actions.tenant_id, tenant_id)];
      if (q) {
        const filter = buildLuceneFilter(actions, q, ["name"]);
        if (filter) conditions.push(filter);
      }
      const whereClause = and(...conditions);

      let query = db.select().from(actions).where(whereClause).$dynamic();

      if (sort?.sort_by) {
        const col = (actions as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const rows = await query.offset(page * per_page).limit(per_page);
      const mapped = rows.map(rowToAction);

      if (!include_totals) {
        return { actions: mapped, start: 0, limit: 0, length: 0 };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(actions)
        .where(whereClause);

      return {
        actions: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async update(
      tenant_id: string,
      action_id: string,
      action: ActionUpdate,
    ): Promise<boolean> {
      const updateData: Record<string, unknown> = {
        updated_at_ts: Date.now(),
      };

      if (action.name !== undefined) updateData.name = action.name;
      if (action.code !== undefined) updateData.code = action.code;
      if (action.runtime !== undefined) updateData.runtime = action.runtime;
      if (action.secrets !== undefined) {
        // Merge: an incoming secret without `value` preserves the existing
        // value for that name, so PATCH callers can round-trip the masked
        // secret list without clobbering stored values.
        const existing = await db
          .select({ secrets: actions.secrets })
          .from(actions)
          .where(
            and(eq(actions.tenant_id, tenant_id), eq(actions.id, action_id)),
          )
          .get();
        const existingByName = new Map(
          parseStoredSecrets(existing?.secrets).map((s) => [s.name, s]),
        );
        const merged = action.secrets.map((s) =>
          s.value === undefined
            ? { name: s.name, value: existingByName.get(s.name)?.value }
            : s,
        );
        updateData.secrets = JSON.stringify(merged);
      }
      if (action.dependencies !== undefined) {
        updateData.dependencies = JSON.stringify(action.dependencies);
      }
      if (action.supported_triggers !== undefined) {
        updateData.supported_triggers = JSON.stringify(
          action.supported_triggers,
        );
      }
      if (action.status !== undefined) updateData.status = action.status;
      if (action.deployed_at !== undefined) {
        const parsedTs = new Date(action.deployed_at).getTime();
        if (Number.isFinite(parsedTs)) {
          updateData.deployed_at_ts = parsedTs;
        }
      }
      if (action.is_system !== undefined) {
        updateData.is_system = action.is_system ? 1 : 0;
      }
      if (action.inherit !== undefined) {
        updateData.inherit = action.inherit ? 1 : 0;
      }

      const results = await db
        .update(actions)
        .set(updateData)
        .where(and(eq(actions.tenant_id, tenant_id), eq(actions.id, action_id)))
        .returning();

      return results.length > 0;
    },

    async remove(tenant_id: string, action_id: string): Promise<boolean> {
      const results = await db
        .delete(actions)
        .where(and(eq(actions.tenant_id, tenant_id), eq(actions.id, action_id)))
        .returning();

      return results.length > 0;
    },
  };
}
