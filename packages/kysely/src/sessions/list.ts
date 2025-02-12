import {
  ListParams,
  ListSesssionsResponse,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { luceneFilter } from "../helpers/filter";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";

/**
 * Retrieves and paginates session records for a specific tenant.
 *
 * This function returns an asynchronous function that queries the "sessions" table using the provided
 * database connection. It filters sessions using an optional search query (applied to `user_id` and `session_id`),
 * orders the results based on provided sorting parameters, and paginates them using the page number and items per page.
 * Each session's `device` and `clients` fields are parsed from JSON strings into objects.
 *
 * @param db - A Kysely instance connected to the database.
 * @returns An asynchronous function that accepts:
 *   - tenant_id: The tenant identifier to filter sessions.
 *   - params: An object containing optional parameters for search (`q`), sorting (`sort`), and pagination (`page`, `per_page`, `include_totals`).
 *
 * The returned promise resolves to an object containing:
 *   - sessions: An array of session objects with parsed `device` and `clients` fields.
 *   - start: The starting index of the current page.
 *   - limit: The maximum number of sessions per page.
 *   - length: The total number of session records for the tenant.
 *
 * @example
 * const getSessions = list(db);
 * const result = await getSessions("tenant123", {
 *   page: 0,
 *   per_page: 50,
 *   q: "user_search_term",
 *   sort: { sort_by: "created_at", sort_order: "desc" }
 * });
 * console.log(result.sessions);
 */
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
      .selectFrom("sessions")
      .where("sessions.tenant_id", "=", tenant_id);

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
