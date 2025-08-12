import { Kysely } from "kysely";
import { Rule } from "@authhero/adapter-interfaces";
import { Database, sqlRuleSchema } from "../db";
import { z } from "@hono/zod-openapi";

type RuleDbRow = z.infer<typeof sqlRuleSchema>;

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, rule_id: string): Promise<Rule | null> => {
    const row = await db
      .selectFrom("rules")
      .selectAll()
      .where("tenant_id", "=", tenant_id)
      .where("id", "=", rule_id)
      .executeTakeFirst();

    if (!row) return null;

    const dbRow = row as RuleDbRow;
    const { enabled, ...rest } = dbRow;

    const rule: Rule = {
      ...rest,
      enabled: !!enabled,
    };

    return rule;
  };
}
