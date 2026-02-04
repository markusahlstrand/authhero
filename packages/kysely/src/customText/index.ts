import {
  CustomTextAdapter,
  CustomText,
  PromptScreen,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function createCustomTextAdapter(
  db: Kysely<Database>,
): CustomTextAdapter {
  return {
    async get(
      tenant_id: string,
      prompt: PromptScreen,
      language: string,
    ): Promise<CustomText | null> {
      const result = await db
        .selectFrom("custom_text")
        .selectAll()
        .where("tenant_id", "=", tenant_id)
        .where("prompt", "=", prompt)
        .where("language", "=", language)
        .executeTakeFirst();

      if (!result) {
        return null;
      }

      try {
        return JSON.parse(result.custom_text);
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
      const now = Date.now();
      const customTextJson = JSON.stringify(customText);

      // Try to update first, then insert if not found
      const existing = await db
        .selectFrom("custom_text")
        .select("tenant_id")
        .where("tenant_id", "=", tenant_id)
        .where("prompt", "=", prompt)
        .where("language", "=", language)
        .executeTakeFirst();

      if (existing) {
        await db
          .updateTable("custom_text")
          .set({
            custom_text: customTextJson,
            updated_at_ts: now,
          })
          .where("tenant_id", "=", tenant_id)
          .where("prompt", "=", prompt)
          .where("language", "=", language)
          .execute();
      } else {
        await db
          .insertInto("custom_text")
          .values({
            tenant_id,
            prompt,
            language,
            custom_text: customTextJson,
            created_at_ts: now,
            updated_at_ts: now,
          })
          .execute();
      }
    },

    async delete(
      tenant_id: string,
      prompt: PromptScreen,
      language: string,
    ): Promise<void> {
      await db
        .deleteFrom("custom_text")
        .where("tenant_id", "=", tenant_id)
        .where("prompt", "=", prompt)
        .where("language", "=", language)
        .execute();
    },

    async list(
      tenant_id: string,
    ): Promise<Array<{ prompt: PromptScreen; language: string }>> {
      const results = await db
        .selectFrom("custom_text")
        .select(["prompt", "language"])
        .where("tenant_id", "=", tenant_id)
        .execute();

      return results.map((r) => ({
        prompt: r.prompt as PromptScreen,
        language: r.language,
      }));
    },
  };
}
