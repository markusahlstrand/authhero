import { Kysely } from "kysely";
import { removeNullProperties } from "../helpers/remove-nulls";
import { PromptSetting } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string): Promise<PromptSetting> => {
    const [promptSetting] = await db
      .selectFrom("promptSettings")
      .where("promptSettings.tenant_id", "=", tenant_id)
      .selectAll()
      .execute();

    return removeNullProperties({
      identifier_first: !!promptSetting?.identifier_first,
      password_first: !!promptSetting?.password_first,
      webauthn_platform_first_factor:
        !!promptSetting?.webauthn_platform_first_factor,
      universal_login_experience:
        promptSetting?.universal_login_experience || "new",
    });
  };
}
