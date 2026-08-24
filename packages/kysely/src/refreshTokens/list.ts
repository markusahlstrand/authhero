import {
  ListParams,
  ListRefreshTokenResponse,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { luceneFilter } from "../helpers/filter";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";
import { keysetPaginate, isKeysetRequest } from "../helpers/paginate";
import { toRefreshToken } from "./to-refresh-token";

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ListParams = {},
  ): Promise<ListRefreshTokenResponse> => {
    const { page = 0, per_page = 50, include_totals = false, sort, q } = params;

    let query = db
      .selectFrom("refresh_tokens")
      .where("refresh_tokens.tenant_id", "=", tenant_id);

    if (q) {
      query = luceneFilter(db, query, q, ["token", "login_id"]);
    }

    // Keyset (checkpoint) pagination: from/take. Fixed created_at desc order
    // with an id tiebreaker and no total, matching Auth0's checkpoint
    // responses on /users/{user_id}/refresh-tokens.
    if (isKeysetRequest(params)) {
      const { rows, limit, next } = await keysetPaginate(
        query.selectAll(),
        params,
        { sortColumn: "created_at_ts", sortOrder: "desc" },
      );
      const refresh_tokens = rows.map(toRefreshToken);
      return {
        refresh_tokens,
        start: 0,
        limit,
        length: refresh_tokens.length,
        next,
      };
    }

    let filteredQuery = query;

    if (sort && sort.sort_by) {
      const { ref } = db.dynamic;
      filteredQuery = filteredQuery.orderBy(ref(sort.sort_by), sort.sort_order);
    }

    filteredQuery = filteredQuery.offset(page * per_page).limit(per_page);

    const refresh_tokens = await filteredQuery.selectAll().execute();

    const mappedTokens = refresh_tokens.map(toRefreshToken);

    if (!include_totals) {
      return {
        refresh_tokens: mappedTokens,
        start: 0,
        limit: 0,
        length: 0,
      };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    const countInt = getCountAsInt(count);

    return {
      refresh_tokens: mappedTokens,
      start: page * per_page,
      limit: per_page,
      length: countInt,
    };
  };
}
