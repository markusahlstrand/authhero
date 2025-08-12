import { Kysely } from "kysely";
import {
  ListParams,
  ListRulesResponse,
  Rule,
} from "@authhero/adapter-interfaces";
import { Database, sqlRuleSchema } from "../db";
import getCountAsInt from "../utils/getCountAsInt";
import { luceneFilter } from "../helpers/filter";
import { z } from "@hono/zod-openapi";

type RuleDbRow = z.infer<typeof sqlRuleSchema>;

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ListParams = { page: 0, per_page: 50, include_totals: false },
  ): Promise<ListRulesResponse> => {
    let query = db.selectFrom("rules").where("rules.tenant_id", "=", tenantId);

    if (params.q) {
      query = luceneFilter(db, query, params.q, ["name", "stage"]);
    }

    const filteredQuery = query
      .offset(params.page * params.per_page)
      .limit(params.per_page);

    const rows = await filteredQuery.selectAll().execute();
    const rules: Rule[] = rows.map((row) => {
      const dbRow = row as RuleDbRow;
      const { enabled, ...rest } = dbRow;

      return {
        ...rest,
        enabled: !!enabled,
      };
    });

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      rules,
      start: params.page * params.per_page,
      limit: params.per_page,
      length: getCountAsInt(count),
    };
  };
}
