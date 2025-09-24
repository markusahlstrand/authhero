import {
  PromptSetting,
  promptSettingSchema,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

function convertToBooleans(promptSetting: Partial<PromptSetting>) {
  const result: any = {};

  if (promptSetting.webauthn_platform_first_factor !== undefined) {
    result.webauthn_platform_first_factor =
      promptSetting.webauthn_platform_first_factor ? 1 : 0;
  }

  if (promptSetting.identifier_first !== undefined) {
    result.identifier_first = promptSetting.identifier_first ? 1 : 0;
  }

  if (promptSetting.password_first !== undefined) {
    result.password_first = promptSetting.password_first ? 1 : 0;
  }

  if (promptSetting.universal_login_experience !== undefined) {
    result.universal_login_experience =
      promptSetting.universal_login_experience;
  }

  return result;
}

export function set(db: Kysely<Database>) {
  return async (tenant_id: string, promptSetting: Partial<PromptSetting>) => {
    try {
      const promptSettingsWithDefaults =
        promptSettingSchema.parse(promptSetting);
      await db
        .insertInto("prompt_settings")
        .values({
          ...convertToBooleans(promptSettingsWithDefaults),
          tenant_id,
        })
        .execute();
    } catch (error) {
      await db
        .updateTable("prompt_settings")
        .set(convertToBooleans(promptSetting))
        .where("tenant_id", "=", tenant_id)
        .execute();
    }
  };
}
