import { Kysely } from "kysely";
import {
  ActionVersion,
  ActionVersionInsert,
  ActionVersionsAdapter,
  CreateOptions,
  ListActionVersionsResponse,
  ListParams,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { generateActionVersionId } from "../utils/entity-id";
import getCountAsInt from "../utils/getCountAsInt";

function parseJsonField<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

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
    secrets: parseJsonField<Array<{ name: string; value?: string }>>(secrets),
    dependencies:
      parseJsonField<Array<{ name: string; version: string }>>(dependencies),
    supported_triggers:
      parseJsonField<Array<{ id: string; version?: string }>>(
        supported_triggers,
      ),
    created_at: new Date(Number(created_at_ts)).toISOString(),
    updated_at: new Date(Number(updated_at_ts)).toISOString(),
  } as ActionVersion;
}

export function createActionVersionsAdapter(
  db: Kysely<Database>,
): ActionVersionsAdapter {
  return {
    async create(
      tenant_id: string,
      version: ActionVersionInsert,
      options?: CreateOptions,
    ): Promise<ActionVersion> {
      const importMetadata = options?.importMetadata;
      const now = Date.now();
      const createdAtTs = importMetadata?.created_at
        ? new Date(importMetadata.created_at).getTime()
        : now;
      // Preserve source timestamp on import: fall back to the imported
      // created_at (not replay time) when updated_at is absent so historical
      // replay keeps the original ordering.
      const updatedAtTs = importMetadata?.updated_at
        ? new Date(importMetadata.updated_at).getTime()
        : importMetadata
          ? createdAtTs
          : now;
      const id = importMetadata?.id ?? generateActionVersionId();
      const deployed = version.deployed !== false;

      // Wrap latest-lookup, deployed-clear, and insert in a single transaction
      // so concurrent creates serialize on the unique
      // (tenant_id, action_id, number) index and can't observe a half-applied
      // state. The unique index still rejects races that beat the read here.
      const nextNumber = await db.transaction().execute(async (trx) => {
        const latest = await trx
          .selectFrom("action_versions")
          .where("tenant_id", "=", tenant_id)
          .where("action_id", "=", version.action_id)
          .select("number")
          .orderBy("number", "desc")
          .limit(1)
          .executeTakeFirst();

        const next = (latest?.number ?? 0) + 1;

        if (deployed) {
          // On import, only clear prior deployed flags — bumping updated_at_ts
          // to replay time would corrupt the historical timestamps of older
          // rows. Live creates still touch updated_at_ts as before.
          await trx
            .updateTable("action_versions")
            .set(
              importMetadata
                ? { deployed: 0 }
                : { deployed: 0, updated_at_ts: now },
            )
            .where("tenant_id", "=", tenant_id)
            .where("action_id", "=", version.action_id)
            .execute();
        }

        await trx
          .insertInto("action_versions")
          .values({
            id,
            tenant_id,
            action_id: version.action_id,
            number: next,
            code: version.code,
            runtime: version.runtime || null,
            secrets: version.secrets ? JSON.stringify(version.secrets) : null,
            dependencies: version.dependencies
              ? JSON.stringify(version.dependencies)
              : null,
            supported_triggers: version.supported_triggers
              ? JSON.stringify(version.supported_triggers)
              : null,
            deployed: deployed ? 1 : 0,
            created_at_ts: createdAtTs,
            updated_at_ts: updatedAtTs,
          })
          .execute();

        return next;
      });

      return {
        id,
        tenant_id,
        action_id: version.action_id,
        number: nextNumber,
        code: version.code,
        runtime: version.runtime,
        secrets: version.secrets,
        dependencies: version.dependencies,
        supported_triggers: version.supported_triggers,
        deployed,
        created_at: new Date(createdAtTs).toISOString(),
        updated_at: new Date(updatedAtTs).toISOString(),
      };
    },

    async get(tenant_id, action_id, version_id) {
      const row = await db
        .selectFrom("action_versions")
        .where("tenant_id", "=", tenant_id)
        .where("action_id", "=", action_id)
        .where("id", "=", version_id)
        .selectAll()
        .executeTakeFirst();

      return row ? rowToVersion(row) : null;
    },

    async list(
      tenant_id,
      action_id,
      params: ListParams = {},
    ): Promise<ListActionVersionsResponse> {
      const { page = 0, per_page = 50, include_totals = false } = params;

      const baseQuery = db
        .selectFrom("action_versions")
        .where("tenant_id", "=", tenant_id)
        .where("action_id", "=", action_id);

      const rows = await baseQuery
        .orderBy("number", "desc")
        .offset(page * per_page)
        .limit(per_page)
        .selectAll()
        .execute();

      const versions = rows.map(rowToVersion);

      if (!include_totals) {
        return { versions, start: 0, limit: 0, length: 0 };
      }

      const { count } = await baseQuery
        .select((eb) => eb.fn.countAll().as("count"))
        .executeTakeFirstOrThrow();

      return {
        versions,
        start: page * per_page,
        limit: per_page,
        length: getCountAsInt(count),
      };
    },

    async removeForAction(tenant_id, action_id) {
      const result = await db
        .deleteFrom("action_versions")
        .where("tenant_id", "=", tenant_id)
        .where("action_id", "=", action_id)
        .executeTakeFirst();

      return Number(result.numDeletedRows ?? 0);
    },
  };
}
