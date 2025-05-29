import { Kysely } from "kysely";
import { removeNullProperties } from "../helpers/remove-nulls";
import { luceneFilter } from "../helpers/filter";
import { ListHooksResponse, ListParams } from "@authhero/adapter-interfaces";
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
  ): Promise<ListHooksResponse> => {
    let query = db.selectFrom("hooks").where("hooks.tenant_id", "=", tenant_id);

    if (params.q) {
      query = luceneFilter(db, query, params.q, ["url", "form_id"]);
    }

    const filteredQuery = query
      .offset(params.page * params.per_page)
      .limit(params.per_page);

    const results = await filteredQuery.selectAll().execute();

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    const hooks = results.map((hook) => {
      const { tenant_id, enabled, synchronous, ...rest } = hook;

      return removeNullProperties({
        ...rest,
        enabled: !!enabled,
        synchronous: !!synchronous,
      });
    });

    return {
      hooks,
      start: params.page * params.per_page,
      limit: params.per_page,
      length: getCountAsInt(count),
    };
  };
}
