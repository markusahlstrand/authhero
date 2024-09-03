import { Kysely } from "kysely";
import { luceneFilter } from "../helpers/filter";
import { removeNullProperties } from "../helpers/remove-nulls";
import {
  ListConnectionsResponse,
  ListParams,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";
import { unflattenObject } from "../utils/flatten";

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ListParams,
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

    const connections = await filteredQuery.selectAll().execute();

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      connections: connections.map((connecction) =>
        removeNullProperties(unflattenObject(connecction, ["options"])),
      ),
      start: params.page * params.per_page,
      limit: params.per_page,
      length: getCountAsInt(count),
    };
  };
}
