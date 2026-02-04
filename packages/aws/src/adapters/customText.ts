import {
  CustomTextAdapter,
  CustomText,
  PromptScreen,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { customTextKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryItems,
} from "../utils";

interface CustomTextItem extends DynamoDBBaseItem {
  tenant_id: string;
  prompt: string;
  language: string;
  custom_text: string; // JSON stringified CustomText
}

export function createCustomTextAdapter(
  ctx: DynamoDBContext,
): CustomTextAdapter {
  return {
    async get(
      tenant_id: string,
      prompt: PromptScreen,
      language: string,
    ): Promise<CustomText | null> {
      const item = await getItem<CustomTextItem>(
        ctx,
        customTextKeys.pk(tenant_id),
        customTextKeys.sk(prompt, language),
      );

      if (!item) {
        return null;
      }

      try {
        return JSON.parse(item.custom_text);
      } catch {
        return null;
      }
    },

    async set(
      tenant_id: string,
      prompt: PromptScreen,
      language: string,
      customText: CustomText,
    ): Promise<void> {
      const now = new Date().toISOString();

      // Check if item already exists to preserve created_at
      const existing = await getItem<CustomTextItem>(
        ctx,
        customTextKeys.pk(tenant_id),
        customTextKeys.sk(prompt, language),
      );

      const item: CustomTextItem = {
        PK: customTextKeys.pk(tenant_id),
        SK: customTextKeys.sk(prompt, language),
        entityType: "CUSTOM_TEXT",
        tenant_id,
        prompt,
        language,
        custom_text: JSON.stringify(customText),
        created_at: existing?.created_at || now,
        updated_at: now,
      };

      await putItem(ctx, item);
    },

    async delete(
      tenant_id: string,
      prompt: PromptScreen,
      language: string,
    ): Promise<void> {
      await deleteItem(
        ctx,
        customTextKeys.pk(tenant_id),
        customTextKeys.sk(prompt, language),
      );
    },

    async list(
      tenant_id: string,
    ): Promise<Array<{ prompt: PromptScreen; language: string }>> {
      const result = await queryItems<CustomTextItem>(
        ctx,
        customTextKeys.pk(tenant_id),
        { skPrefix: customTextKeys.skPrefix() },
      );

      return result.items.map((item) => ({
        prompt: item.prompt as PromptScreen,
        language: item.language,
      }));
    },
  };
}
