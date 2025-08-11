import { nanoid } from "nanoid";
import { Kysely } from "kysely";
import { Rule, RuleInsert, ruleSchema } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, params: RuleInsert): Promise<Rule> => {
    const withId = { id: nanoid(), ...params } as any;
    const rule = ruleSchema.parse(withId);

    await db
      .insertInto("rules")
      .values({
        ...rule,
        tenant_id,
        enabled: rule.enabled ? 1 : 0,
      })
      .execute();

    return rule;
  };
}
