import { PromptSetting } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function set(db: Kysely<Database>) {
  return async (tenant_id: string, promptSetting: PromptSetting) => {
    try {
      await db
        .insertInto("promptSettings")
        .values({
          ...promptSetting,
          tenant_id,
        })
        .execute();
    } catch (error) {
      await db
        .updateTable("promptSettings")
        .set(promptSetting)
        .where("tenant_id", "=", tenant_id)
        .execute();
    }
  };
}
