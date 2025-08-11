import { Kysely } from "kysely";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    rule_id: string,
    rule: Partial<{
      enabled: boolean;
      name: string;
      script: string;
      order: number;
      stage: string;
    }>,
  ): Promise<boolean> => {
    const updates: any = { ...rule };
    if (typeof updates.enabled === "boolean") {
      updates.enabled = updates.enabled ? 1 : 0;
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
