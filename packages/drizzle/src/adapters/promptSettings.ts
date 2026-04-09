import { eq } from "drizzle-orm";
import type { PromptSetting } from "@authhero/adapter-interfaces";
import { promptSettings } from "../schema/sqlite";
import type { DrizzleDb } from "./types";

export function createPromptSettingsAdapter(
  db: DrizzleDb,
) {
  return {
    async get(tenant_id: string): Promise<PromptSetting> {
      const result = await db
        .select()
        .from(promptSettings)
        .where(eq(promptSettings.tenant_id, tenant_id))
        .get();

      if (!result) {
        return {
          universal_login_experience: "new",
          identifier_first: true,
          password_first: false,
          webauthn_platform_first_factor: false,
        };
      }

      return {
        universal_login_experience:
          result.universal_login_experience as PromptSetting["universal_login_experience"],
        identifier_first: !!result.identifier_first,
        password_first: !!result.password_first,
        webauthn_platform_first_factor: !!result.webauthn_platform_first_factor,
      };
    },

    async set(tenant_id: string, data: PromptSetting): Promise<void> {
      await db
        .insert(promptSettings)
        .values({
          tenant_id,
          universal_login_experience: data.universal_login_experience,
          identifier_first: data.identifier_first,
          password_first: data.password_first,
          webauthn_platform_first_factor: data.webauthn_platform_first_factor,
        })
        .onConflictDoUpdate({
          target: promptSettings.tenant_id,
          set: {
            universal_login_experience: data.universal_login_experience,
            identifier_first: data.identifier_first,
            password_first: data.password_first,
            webauthn_platform_first_factor: data.webauthn_platform_first_factor,
          },
        });
    },
  };
}
