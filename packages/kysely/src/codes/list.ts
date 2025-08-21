import {
  codeSchema,
  ListParams,
  ListCodesResponse,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { luceneFilter } from "../helpers/filter";
import { removeNullProperties } from "../helpers/remove-nulls";
import getCountAsInt from "../utils/getCountAsInt";

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ListParams = {},
  ): Promise<ListCodesResponse> => {
    const { page = 0, per_page = 50, include_totals = false, q } = params;

    let query = db.selectFrom("codes").where("codes.tenant_id", "=", tenant_id);

    if (q) {
      query = luceneFilter(db, query, q, ["code", "login_id"]);
    }

    const filteredQuery = query.offset(page * per_page).limit(per_page);

    const results = await filteredQuery.selectAll().execute();

    const codes = results.map((hook) => {
      const { tenant_id, ...rest } = hook;

      return codeSchema.parse(removeNullProperties(rest));
    });

    if (!include_totals) {
      return {
        codes,
        start: 0,
        limit: 0,
        length: 0,
      };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      codes,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
