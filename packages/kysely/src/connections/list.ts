import { Kysely } from "kysely";
import { luceneFilter } from "../helpers/filter";
import { removeNullProperties } from "../helpers/remove-nulls";
import {
  Connection,
  ListConnectionsResponse,
  ListParams,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";

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

    const filteredQuery = query.offset(page * per_page).limit(per_page);

    const dbConnections = await filteredQuery.selectAll().execute();
    const connections: Connection[] = dbConnections.map((connection) => {
      const { synced, ...rest } = connection;
      return removeNullProperties({
        ...rest,
        synced: synced ? true : undefined,
        options: JSON.parse(connection.options),
      });
    });

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
