import { Kysely } from "kysely";
import { luceneFilter } from "../helpers/filter";
import {
  ListConnectionsResponse,
  ListParams,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";
import { transformConnections } from "./transform";
import { keysetPaginate, isKeysetRequest } from "../helpers/paginate";

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ListParams = {},
  ): Promise<ListConnectionsResponse> => {
    const { page = 0, per_page = 50, include_totals = false, q } = params;

    let query = db
      .selectFrom("connections")
      .where("connections.tenant_id", "=", tenantId);

    if (q) {
      query = luceneFilter(db, query, q, ["user_id", "ip"]);
    }

    // Keyset (checkpoint) pagination: from/take. Fixed created_at desc order
    // with an id tiebreaker; no total, matching Auth0's checkpoint responses.
    if (isKeysetRequest(params)) {
      const { rows, limit, next } = await keysetPaginate(
        query.selectAll(),
        params,
        { sortColumn: "created_at", sortOrder: "desc", idColumn: "id" },
      );
      const pageConnections = transformConnections(rows);
      return {
        connections: pageConnections,
        start: 0,
        limit,
        length: pageConnections.length,
        next,
      };
    }

    const filteredQuery = query.offset(page * per_page).limit(per_page);

    const dbConnections = await filteredQuery.selectAll().execute();
    const connections = transformConnections(dbConnections);

    if (!include_totals) {
      return {
        connections,
        start: 0,
        limit: 0,
        length: 0,
      };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      connections,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
