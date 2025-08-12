import { Kysely } from "kysely";
import { Rule } from "@authhero/adapter-interfaces";
import { Database, sqlRuleSchema } from "../db";
import { z } from "@hono/zod-openapi";

type RuleDbUpdate = Partial<z.infer<typeof sqlRuleSchema>>;

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    rule_id: string,
    params: Partial<Rule>,
  ): Promise<boolean> => {
    const { enabled, ...rest } = params;

    const updates: RuleDbUpdate = { ...rest };

    if (enabled !== undefined) {
      updates.enabled = enabled ? 1 : 0;
    }

    const result = await db
      .updateTable("rules")
      .set(updates)
      .where("tenant_id", "=", tenant_id)
      .where("id", "=", rule_id)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  };
}
