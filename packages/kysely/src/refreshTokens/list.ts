import {
  ListParams,
  ListRefreshTokenResponse,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { luceneFilter } from "../helpers/filter";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";
import { convertDatesToAdapter } from "../utils/dateConversion";

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
      query = luceneFilter(db, query, q, ["token", "session_id"]);
    }

    let filteredQuery = query;

    if (sort && sort.sort_by) {
      const { ref } = db.dynamic;
      filteredQuery = filteredQuery.orderBy(ref(sort.sort_by), sort.sort_order);
    }

    filteredQuery = filteredQuery.offset(page * per_page).limit(per_page);

    const refresh_tokens = await filteredQuery.selectAll().execute();

    const mappedTokens = refresh_tokens.map((refresh_token) => {
      const {
        tenant_id: _,
        created_at_ts,
        expires_at_ts,
        idle_expires_at_ts,
        last_exchanged_at_ts,
        ...rest
      } = refresh_token;

      // Convert dates from DB format (bigint) to ISO strings
      const dates = convertDatesToAdapter(
        { created_at_ts, expires_at_ts, idle_expires_at_ts, last_exchanged_at_ts },
        ["created_at_ts"],
        ["expires_at_ts", "idle_expires_at_ts", "last_exchanged_at_ts"],
      ) as {
        created_at: string;
        expires_at?: string;
        idle_expires_at?: string;
        last_exchanged_at?: string;
      };

      return {
        ...rest,
        ...dates,
        rotating: !!refresh_token.rotating,
        device: refresh_token.device ? JSON.parse(refresh_token.device) : {},
        resource_servers: refresh_token.resource_servers
          ? JSON.parse(refresh_token.resource_servers)
          : [],
      };
    });

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
