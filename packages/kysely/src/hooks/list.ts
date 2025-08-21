import { Kysely } from "kysely";
import { removeNullProperties } from "../helpers/remove-nulls";
import { luceneFilter } from "../helpers/filter";
import { ListHooksResponse, ListParams } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ListParams = {},
  ): Promise<ListHooksResponse> => {
    const { page = 0, per_page = 50, include_totals = false, q } = params;

    let query = db.selectFrom("hooks").where("hooks.tenant_id", "=", tenant_id);

    if (q) {
      query = luceneFilter(db, query, q, ["url", "form_id"]);
    }

    const filteredQuery = query.offset(page * per_page).limit(per_page);

    const results = await filteredQuery.selectAll().execute();

    const hooks = results.map((hook) => {
      const { tenant_id, enabled, synchronous, ...rest } = hook;

      return removeNullProperties({
        ...rest,
        enabled: !!enabled,
        synchronous: !!synchronous,
      });
    });

    if (!include_totals) {
      return {
        hooks,
        start: 0,
        limit: 0,
        length: 0,
      };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      hooks,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
