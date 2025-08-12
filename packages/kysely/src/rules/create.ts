import { nanoid } from "nanoid";
import { Kysely } from "kysely";
import { Rule, RuleInsert, ruleSchema } from "@authhero/adapter-interfaces";
import { Database, sqlRuleSchema } from "../db";
import { z } from "@hono/zod-openapi";

type RuleDbInsert = z.infer<typeof sqlRuleSchema>;

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, params: RuleInsert): Promise<Rule> => {
    const withId = { id: nanoid(), ...params };
    const rule = ruleSchema.parse(withId);

    const { enabled, ...rest } = rule;

    const dbRule: RuleDbInsert = {
      ...rest,
      tenant_id,
      enabled: enabled ? 1 : 0,
    };

    await db.insertInto("rules").values(dbRule).execute();

    return rule;
  };
}
