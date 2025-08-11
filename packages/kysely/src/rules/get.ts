import { Kysely } from "kysely";
import { Rule } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, rule_id: string): Promise<Rule | null> => {
    const row = await db
      .selectFrom("rules")
      .selectAll()
      .where("tenant_id", "=", tenant_id)
      .where("id", "=", rule_id)
      .executeTakeFirst();

    if (!row) return null;

    return { ...row, enabled: !!row.enabled } as Rule;
  };
}
