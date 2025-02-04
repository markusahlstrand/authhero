import {
  ListParams,
  ListRefreshTokenResponse,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { luceneFilter } from "../helpers/filter";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ListParams = {
      page: 0,
      per_page: 50,
      include_totals: false,
    },
  ): Promise<ListRefreshTokenResponse> => {
    let query = db
      .selectFrom("refresh_tokens")
      .where("refresh_tokens.tenant_id", "=", tenant_id);

    if (params.q) {
      query = luceneFilter(db, query, params.q, [
        "refresh_token",
        "session_id",
      ]);
    }

    let filteredQuery = query;

    if (params.sort && params.sort.sort_by) {
      const { ref } = db.dynamic;
      filteredQuery = filteredQuery.orderBy(
        ref(params.sort.sort_by),
        params.sort.sort_order,
      );
    }

    filteredQuery = filteredQuery
      .offset(params.page * params.per_page)
      .limit(params.per_page);

    const refresh_tokens = await filteredQuery.selectAll().execute();

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    const countInt = getCountAsInt(count);

    return {
      refresh_tokens,
      start: params.page * params.per_page,
      limit: params.per_page,
      length: countInt,
    };
  };
}
