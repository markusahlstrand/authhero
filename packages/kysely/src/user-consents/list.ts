import {
  ListParams,
  ListUserConsentsResponse,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { luceneFilter } from "../helpers/filter";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ListParams = {},
  ): Promise<ListUserConsentsResponse> => {
    const { page = 0, per_page = 50, include_totals = false, sort, q } = params;

    let query = db
      .selectFrom("user_consents")
      .where("user_consents.tenant_id", "=", tenant_id);

    if (q) {
      query = luceneFilter(db, query, q, ["user_id", "client_id"]);
    }

    let filteredQuery = query;
    if (sort && sort.sort_by) {
      const { ref } = db.dynamic;
      filteredQuery = filteredQuery.orderBy(ref(sort.sort_by), sort.sort_order);
    }
    filteredQuery = filteredQuery.offset(page * per_page).limit(per_page);

    const rows = await filteredQuery.selectAll().execute();
    const user_consents = rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      client_id: row.client_id,
      scopes: row.scopes ? JSON.parse(row.scopes) : [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    if (!include_totals) {
      return { user_consents, start: 0, limit: 0, length: 0 };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      user_consents,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
