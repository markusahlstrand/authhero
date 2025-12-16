import {
  PromptSettingsAdapter,
  PromptSetting,
  promptSettingSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { promptSettingsKeys } from "../keys";
import {
  getItem,
  putItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface PromptSettingsItem extends DynamoDBBaseItem {
  tenant_id: string;
  universal_login_experience?: string;
  identifier_first?: boolean;
  password_first?: boolean;
  webauthn_platform_first_factor?: boolean;
}

const defaultPromptSettings: PromptSetting = {
  universal_login_experience: "new",
  identifier_first: false,
  password_first: false,
  webauthn_platform_first_factor: false,
};

function toPromptSettings(item: PromptSettingsItem): PromptSetting {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);
  const data = removeNullProperties({
    universal_login_experience: rest.universal_login_experience || "new",
    identifier_first: rest.identifier_first ?? false,
    password_first: rest.password_first ?? false,
    webauthn_platform_first_factor: rest.webauthn_platform_first_factor ?? false,
  });

  return promptSettingSchema.parse(data);
}

export function createPromptSettingsAdapter(
  ctx: DynamoDBContext,
): PromptSettingsAdapter {
  return {
    async set(
      tenantId: string,
      promptSetting: Partial<PromptSetting>,
    ): Promise<void> {
      const now = new Date().toISOString();

      // Get existing settings to merge
      const existing = await this.get(tenantId);

      // Fetch raw item to get created_at timestamp
      const existingItem = await getItem<PromptSettingsItem>(
        ctx,
        promptSettingsKeys.pk(tenantId),
        promptSettingsKeys.sk(),
      );

      const item: PromptSettingsItem = {
        PK: promptSettingsKeys.pk(tenantId),
        SK: promptSettingsKeys.sk(),
        entityType: "PROMPT_SETTING",
        tenant_id: tenantId,
        universal_login_experience:
          promptSetting.universal_login_experience ??
          existing.universal_login_experience,
        identifier_first:
          promptSetting.identifier_first ?? existing.identifier_first,
        password_first: promptSetting.password_first ?? existing.password_first,
        webauthn_platform_first_factor:
          promptSetting.webauthn_platform_first_factor ??
          existing.webauthn_platform_first_factor,
        created_at: existingItem?.created_at || now,
        updated_at: now,
      };

      await putItem(ctx, item);
    },

    async get(tenantId: string): Promise<PromptSetting> {
      const item = await getItem<PromptSettingsItem>(
        ctx,
        promptSettingsKeys.pk(tenantId),
        promptSettingsKeys.sk(),
      );

      if (!item) return defaultPromptSettings;

      return toPromptSettings(item);
    },
  };
}
