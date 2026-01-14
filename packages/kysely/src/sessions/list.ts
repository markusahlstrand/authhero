import {
  ListParams,
  ListSesssionsResponse,
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
  ): Promise<ListSesssionsResponse> => {
    const { page = 0, per_page = 50, include_totals = false, sort, q } = params;

    let query = db
      .selectFrom("sessions")
      .where("sessions.tenant_id", "=", tenant_id);

    if (q) {
      query = luceneFilter(db, query, q, ["user_id", "session_id"]);
    }

    let filteredQuery = query;

    if (sort && sort.sort_by) {
      const { ref } = db.dynamic;
      filteredQuery = filteredQuery.orderBy(ref(sort.sort_by), sort.sort_order);
    }

    filteredQuery = filteredQuery.offset(page * per_page).limit(per_page);

    const sessions = await filteredQuery.selectAll().execute();

    const mappedSessions = sessions.map((session) => {
      const {
        tenant_id: _,
        device,
        clients,
        created_at,
        updated_at,
        expires_at,
        idle_expires_at,
        authenticated_at,
        last_interaction_at,
        used_at,
        revoked_at,
        ...rest
      } = session;

      // Convert dates from DB format (either string or bigint) to ISO strings
      const dates = convertDatesToAdapter(
        { created_at, updated_at, expires_at, idle_expires_at, authenticated_at, last_interaction_at, used_at, revoked_at },
        ["created_at", "updated_at", "authenticated_at", "last_interaction_at"],
        ["expires_at", "idle_expires_at", "used_at", "revoked_at"],
      );

      return {
        ...rest,
        ...dates,
        device: JSON.parse(device),
        clients: JSON.parse(clients),
      };
    });

    if (!include_totals) {
      return {
        sessions: mappedSessions,
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
      sessions: mappedSessions,
      start: page * per_page,
      limit: per_page,
      length: countInt,
    };
  };
}
