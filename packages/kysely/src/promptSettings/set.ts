import { PromptSetting } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

// Picks only the known prompt_settings columns and coerces booleans to 0/1
// for SQLite. Spreading the raw input is unsafe: callers (including the
// management PATCH handler) can pass through fields the table doesn't have,
// which makes kysely bind values for non-existent columns.
function toRow(promptSetting: Partial<PromptSetting>) {
  const row: {
    identifier_first?: number;
    password_first?: number;
    webauthn_platform_first_factor?: number;
    universal_login_experience?: "new" | "classic";
  } = {};
  if (typeof promptSetting.identifier_first === "boolean") {
    row.identifier_first = promptSetting.identifier_first ? 1 : 0;
  }
  if (typeof promptSetting.password_first === "boolean") {
    row.password_first = promptSetting.password_first ? 1 : 0;
  }
  if (typeof promptSetting.webauthn_platform_first_factor === "boolean") {
    row.webauthn_platform_first_factor =
      promptSetting.webauthn_platform_first_factor ? 1 : 0;
  }
  if (promptSetting.universal_login_experience) {
    row.universal_login_experience = promptSetting.universal_login_experience;
  }
  return row;
}

export function set(db: Kysely<Database>) {
  return async (tenant_id: string, promptSetting: Partial<PromptSetting>) => {
    const row = toRow(promptSetting);

    try {
      await db
        .insertInto("prompt_settings")
        .values({
          tenant_id,
          identifier_first: row.identifier_first ?? 1,
          password_first: row.password_first ?? 0,
          webauthn_platform_first_factor:
            row.webauthn_platform_first_factor ?? 0,
          universal_login_experience: row.universal_login_experience ?? "new",
        })
        .execute();
    } catch {
      if (Object.keys(row).length === 0) return;
      await db
        .updateTable("prompt_settings")
        .set(row)
        .where("tenant_id", "=", tenant_id)
        .execute();
    }
  };
}
