import { Kysely } from "kysely";
import {
  flowSchema,
  ListFlowsResponse,
  ListParams,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { luceneFilter } from "../helpers/filter";
import getCountAsInt from "../utils/getCountAsInt";
import { removeNullProperties } from "../helpers/remove-nulls";
import { parseJsonIfDefined } from "../helpers/parse";

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ListParams = {},
  ): Promise<ListFlowsResponse> => {
    const { page = 0, per_page = 50, include_totals = false, q } = params;

    // Start building the query
    let query = db.selectFrom("flows").where("tenant_id", "=", tenant_id);

    // Apply any filters from the params
    if (q) {
      query = luceneFilter(db, query, q, []);
    }

    const filteredQuery = query.offset(page * per_page).limit(per_page);

    // Execute the query
    const results = await filteredQuery.selectAll().execute();

    // Parse JSON columns for each result
    const flows = results.map((result) => {
      const flow = {
        ...result,
        actions: parseJsonIfDefined(result.actions, []),
      };
      return flowSchema.parse(removeNullProperties(flow));
    });

    if (!include_totals) {
      return {
        flows,
        start: 0,
        limit: 0,
        length: 0,
      };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      flows,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
