import { eq, and, desc, count as countFn } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  ActionVersion,
  ActionVersionInsert,
  ActionVersionsAdapter,
  ListActionVersionsResponse,
  ListParams,
} from "@authhero/adapter-interfaces";
import { actionVersions } from "../schema/sqlite";
import { parseJsonIfString } from "../helpers/transform";
import { runAtomic, type AtomicStatementList } from "./atomic";
import type { DrizzleDb } from "./types";

function rowToVersion(row: any): ActionVersion {
  const {
    created_at_ts,
    updated_at_ts,
    secrets,
    dependencies,
    supported_triggers,
    deployed,
    runtime,
    ...rest
  } = row;

  return {
    ...rest,
    runtime: runtime ?? undefined,
    deployed: !!deployed,
    secrets:
      parseJsonIfString<Array<{ name: string; value?: string }>>(secrets),
    dependencies:
      parseJsonIfString<Array<{ name: string; version: string }>>(dependencies),
    supported_triggers:
      parseJsonIfString<Array<{ id: string; version?: string }>>(
        supported_triggers,
      ),
    created_at: new Date(Number(created_at_ts)).toISOString(),
    updated_at: new Date(Number(updated_at_ts)).toISOString(),
  } as ActionVersion;
}

export function createActionVersionsAdapter(
  db: DrizzleDb,
): ActionVersionsAdapter {
  return {
    async create(
      tenant_id: string,
      version: ActionVersionInsert,
    ): Promise<ActionVersion> {
      const now = Date.now();
      const id = `ver_${nanoid()}`;
      const deployed = version.deployed !== false;

      // Read the latest `number` first, then apply the deployed-clear and
      // insert as one atomic unit via runAtomic (db.batch() on D1, manual
      // BEGIN/COMMIT on better-sqlite3 — D1 rejects interactive BEGIN). The
      // unique (tenant_id, action_id, number) index rejects any race that
      // beats the read.
      const latest = await db
        .select({ number: actionVersions.number })
        .from(actionVersions)
        .where(
          and(
            eq(actionVersions.tenant_id, tenant_id),
            eq(actionVersions.action_id, version.action_id),
          ),
        )
        .orderBy(desc(actionVersions.number))
        .limit(1)
        .get();

      const next = (latest?.number ?? 0) + 1;

      const insertStatement = db.insert(actionVersions).values({
        id,
        tenant_id,
        action_id: version.action_id,
        number: next,
        code: version.code,
        runtime: version.runtime ?? null,
        secrets: version.secrets ? JSON.stringify(version.secrets) : null,
        dependencies: version.dependencies
          ? JSON.stringify(version.dependencies)
          : null,
        supported_triggers: version.supported_triggers
          ? JSON.stringify(version.supported_triggers)
          : null,
        deployed: deployed ? 1 : 0,
        created_at_ts: now,
        updated_at_ts: now,
      });

      const statements: AtomicStatementList = deployed
        ? [
            db
              .update(actionVersions)
              .set({ deployed: 0, updated_at_ts: now })
              .where(
                and(
                  eq(actionVersions.tenant_id, tenant_id),
                  eq(actionVersions.action_id, version.action_id),
                  eq(actionVersions.deployed, 1),
                ),
              ),
            insertStatement,
          ]
        : [insertStatement];

      await runAtomic(db, statements);

      return {
        id,
        tenant_id,
        action_id: version.action_id,
        number: next,
        code: version.code,
        runtime: version.runtime,
        secrets: version.secrets,
        dependencies: version.dependencies,
        supported_triggers: version.supported_triggers,
        deployed,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      };
    },

    async get(
      tenant_id: string,
      action_id: string,
      version_id: string,
    ): Promise<ActionVersion | null> {
      const row = await db
        .select()
        .from(actionVersions)
        .where(
          and(
            eq(actionVersions.tenant_id, tenant_id),
            eq(actionVersions.action_id, action_id),
            eq(actionVersions.id, version_id),
          ),
        )
        .get();

      return row ? rowToVersion(row) : null;
    },

    async list(
      tenant_id: string,
      action_id: string,
      params: ListParams = {},
    ): Promise<ListActionVersionsResponse> {
      const { page = 0, per_page = 50, include_totals = false } = params;

      const whereClause = and(
        eq(actionVersions.tenant_id, tenant_id),
        eq(actionVersions.action_id, action_id),
      );

      const rows = await db
        .select()
        .from(actionVersions)
        .where(whereClause)
        .orderBy(desc(actionVersions.number))
        .offset(page * per_page)
        .limit(per_page);

      const versions = rows.map(rowToVersion);

      if (!include_totals) {
        return { versions, start: 0, limit: 0, length: 0 };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(actionVersions)
        .where(whereClause);

      return {
        versions,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async removeForAction(
      tenant_id: string,
      action_id: string,
    ): Promise<number> {
      const results = await db
        .delete(actionVersions)
        .where(
          and(
            eq(actionVersions.tenant_id, tenant_id),
            eq(actionVersions.action_id, action_id),
          ),
        )
        .returning();

      return results.length;
    },
  };
}
