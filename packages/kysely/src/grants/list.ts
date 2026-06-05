import {
  ListParams,
  ListGrantsResponse,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { luceneFilter } from "../helpers/filter";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ListParams = {},
  ): Promise<ListGrantsResponse> => {
    const { page = 0, per_page = 50, include_totals = false, sort, q } = params;

    let query = db
      .selectFrom("grants")
      .where("grants.tenant_id", "=", tenant_id);

    if (q) {
      query = luceneFilter(db, query, q, ["user_id", "client_id", "audience"]);
    }

    let filteredQuery = query;
    if (sort && sort.sort_by) {
      const { ref } = db.dynamic;
      filteredQuery = filteredQuery.orderBy(ref(sort.sort_by), sort.sort_order);
    }
    filteredQuery = filteredQuery.offset(page * per_page).limit(per_page);

    const rows = await filteredQuery.selectAll().execute();
    const grants = rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      clientID: row.client_id,
      audience: row.audience || undefined,
      scope: row.scope ? JSON.parse(row.scope) : [],
    }));

    if (!include_totals) {
      return { grants, start: 0, limit: 0, length: 0 };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      grants,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
