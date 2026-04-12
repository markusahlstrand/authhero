import { Kysely } from "kysely";
import { HookCodeInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    id: string,
    hookCode: Partial<HookCodeInsert>,
  ): Promise<boolean> => {
    const sqlValues: Record<string, unknown> = {
      updated_at_ts: Date.now(),
    };

    if (hookCode.code !== undefined) {
      sqlValues.code = hookCode.code;
    }

    if (hookCode.secrets !== undefined) {
      sqlValues.secrets = JSON.stringify(hookCode.secrets);
    }

    await db
      .updateTable("hook_code")
      .set(sqlValues)
      .where("hook_code.id", "=", id)
      .where("hook_code.tenant_id", "=", tenant_id)
      .execute();

    return true;
  };
}
