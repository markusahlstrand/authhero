import { Kysely } from "kysely";
import { formSchema, ListFormsResponse } from "@authhero/adapter-interfaces";
import { ListParams } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { luceneFilter } from "../helpers/filter";
import getCountAsInt from "../utils/getCountAsInt";
import { removeNullProperties } from "../helpers/remove-nulls";

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ListParams = {
      page: 0,
      per_page: 50,
      include_totals: false,
    },
  ): Promise<ListFormsResponse> => {
    // Start building the query
    let query = db.selectFrom("forms").where("tenant_id", "=", tenant_id);

    // Apply any filters from the params
    if (params?.q) {
      query = luceneFilter(db, query, params.q, []);
    }

    const filteredQuery = query
      .offset(params.page * params.per_page)
      .limit(params.per_page);

    // Execute the query
    const results = await filteredQuery.selectAll().execute();

    // Parse JSON columns or stringified JSON for each result
    const forms = results.map((result) => {
      const parsed = { ...result };
      if (typeof parsed.nodes === "string") {
        try {
          parsed.nodes = JSON.parse(parsed.nodes);
        } catch {}
      }
      if (typeof parsed.start === "string") {
        try {
          parsed.start = JSON.parse(parsed.start);
        } catch {}
      }
      if (typeof parsed.ending === "string") {
        try {
          parsed.ending = JSON.parse(parsed.ending);
        } catch {}
      }
      return formSchema.parse(removeNullProperties(parsed));
    });

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      forms,
      start: params.page * params.per_page,
      limit: params.per_page,
      length: getCountAsInt(count),
    };
  };
}
