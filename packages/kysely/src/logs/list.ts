import { Kysely } from "kysely";
import { ListParams } from "@authhero/adapter-interfaces";
import { luceneFilter } from "../helpers/filter";
import { getLogResponse } from "./logs";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";

export function listLogs(db: Kysely<Database>) {
  return async (tenant_id: string, params: ListParams = {}) => {
    const { page = 0, per_page = 50, include_totals = false, sort, q } = params;

    let query = db.selectFrom("logs").where("logs.tenant_id", "=", tenant_id);

    if (q) {
      query = luceneFilter(db, query, q, ["user_id", "ip"]);
    }

    let filteredQuery = query;

    if (sort && sort.sort_by) {
      const { ref } = db.dynamic;
      filteredQuery = filteredQuery.orderBy(ref(sort.sort_by), sort.sort_order);
    }

    filteredQuery = filteredQuery.offset(page * per_page).limit(per_page);

    const logs = await filteredQuery.selectAll().execute();

    const mappedLogs = logs.map(getLogResponse);

    if (!include_totals) {
      return {
        logs: mappedLogs,
        start: 0,
        limit: 0,
        length: 0,
      };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      logs: mappedLogs,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
