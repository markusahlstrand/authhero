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
    params: ListParams = {
      page: 0,
      per_page: 50,
      include_totals: false,
    },
  ): Promise<ListConnectionsResponse> => {
    let query = db
      .selectFrom("connections")
      .where("connections.tenant_id", "=", tenantId);

    if (params.q) {
      query = luceneFilter(db, query, params.q, ["user_id", "ip"]);
    }

    const filteredQuery = query
      .offset(params.page * params.per_page)
      .limit(params.per_page);

    const dbConnections = await filteredQuery.selectAll().execute();
    const connections: Connection[] = dbConnections.map((connection) =>
      removeNullProperties({
        ...connection,
        options: JSON.parse(connection.options),
      }),
    );

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      connections,
      start: params.page * params.per_page,
      limit: params.per_page,
      length: getCountAsInt(count),
    };
  };
}
