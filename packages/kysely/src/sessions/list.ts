import {
  ListParams,
  ListSesssionsResponse,
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
  ): Promise<ListSesssionsResponse> => {
    let query = db
      .selectFrom("sessions_2")
      .where("sessions_2.tenant_id", "=", tenant_id);

    if (params.q) {
      query = luceneFilter(db, query, params.q, ["user_id", "session_id"]);
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

    const sessions = await filteredQuery.selectAll().execute();

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    const countInt = getCountAsInt(count);

    return {
      sessions: sessions.map((session) => ({
        ...session,
        device: JSON.parse(session.device),
        clients: JSON.parse(session.clients),
      })),
      start: params.page * params.per_page,
      limit: params.per_page,
      length: countInt,
    };
  };
}
