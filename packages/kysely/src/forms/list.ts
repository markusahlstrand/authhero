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

    // Parse JSON strings back to objects for each result
    const forms = results.map((result) =>
      formSchema.parse(
        removeNullProperties({
          ...result,
          fields: JSON.parse(result.fields as string),
          controls: result.controls
            ? JSON.parse(result.controls as string)
            : undefined,
          layout: result.layout
            ? JSON.parse(result.layout as string)
            : undefined,
          active: result.active === 1,
        }),
      ),
    );

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
