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
    params: ListParams,
  ): Promise<ListCodesResponse> => {
    let query = db.selectFrom("codes").where("codes.tenant_id", "=", tenant_id);

    if (params.q) {
      query = luceneFilter(db, query, params.q, ["code", "login_id"]);
    }

    const filteredQuery = query
      .offset(params.page * params.per_page)
      .limit(params.per_page);

    const results = await filteredQuery.selectAll().execute();

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    const codes = results.map((hook) => {
      const { tenant_id, ...rest } = hook;

      return codeSchema.parse(removeNullProperties(rest));
    });

    return {
      codes,
      start: params.page * params.per_page,
      limit: params.per_page,
      length: getCountAsInt(count),
    };
  };
}
