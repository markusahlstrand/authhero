import {
  PromptSetting,
  promptSettingSchema,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function set(db: Kysely<Database>) {
  return async (tenant_id: string, promptSetting: Partial<PromptSetting>) => {
    try {
      const promptSettingsWithDefaults =
        promptSettingSchema.parse(promptSetting);
      await db
        .insertInto("prompt_settings")
        .values({
          ...promptSettingsWithDefaults,
          tenant_id,
        })
        .execute();
    } catch (error) {
      await db
        .updateTable("prompt_settings")
        .set(promptSetting)
        .where("tenant_id", "=", tenant_id)
        .execute();
    }
  };
}
