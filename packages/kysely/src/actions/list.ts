import { Kysely } from "kysely";
import { Action, ListParams } from "@authhero/adapter-interfaces";
import { ListActionsResponse } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { luceneFilter } from "../helpers/filter";
import getCountAsInt from "../utils/getCountAsInt";
import { convertDatesToAdapter } from "../utils/dateConversion";

function parseJsonField<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ListParams = {},
  ): Promise<ListActionsResponse> => {
    const { page = 0, per_page = 50, include_totals = false, q } = params;

    let query = db
      .selectFrom("actions")
      .where("actions.tenant_id", "=", tenant_id);

    if (q) {
      query = luceneFilter(db, query, q, ["name"]);
    }

    const filteredQuery = query.offset(page * per_page).limit(per_page);

    const results = await filteredQuery.selectAll().execute();

    const actions = results.map((row) => {
      const {
        created_at_ts,
        updated_at_ts,
        deployed_at_ts,
        secrets,
        dependencies,
        supported_triggers,
        tenant_id: _tenantId,
        ...rest
      } = row;

      const dates = convertDatesToAdapter({ created_at_ts, updated_at_ts }, [
        "created_at_ts",
        "updated_at_ts",
      ]);

      return {
        ...rest,
        tenant_id,
        ...dates,
        runtime: rest.runtime ?? undefined,
        status: (rest.status as "draft" | "built") || "built",
        deployed_at: deployed_at_ts
          ? new Date(Number(deployed_at_ts)).toISOString()
          : undefined,
        secrets:
          parseJsonField<Array<{ name: string; value?: string }>>(secrets),
        dependencies:
          parseJsonField<Array<{ name: string; version: string }>>(
            dependencies,
          ),
        supported_triggers:
          parseJsonField<Array<{ id: string; version?: string }>>(
            supported_triggers,
          ),
      } as Action;
    });

    if (!include_totals) {
      return {
        actions,
        start: 0,
        limit: 0,
        length: 0,
      };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      actions,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
