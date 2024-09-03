import {
  PromptSetting,
  promptSettingSchema,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { removeNullProperties } from "../helpers/remove-nulls";

function convertToBooleans(promptSetting: Partial<PromptSetting>) {
  return removeNullProperties({
    ...promptSetting,
    webauthn_platform_first_factor: promptSetting.webauthn_platform_first_factor
      ? !!promptSetting.webauthn_platform_first_factor
      : undefined,
    identifier_first: promptSetting.identifier_first
      ? !!promptSetting.identifier_first
      : undefined,
    password_first: promptSetting.password_first
      ? !!promptSetting.password_first
      : undefined,
    universal_login_experience: promptSetting.universal_login_experience,
  });
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
