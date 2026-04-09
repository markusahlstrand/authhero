import { eq, and } from "drizzle-orm";
import type { CustomText } from "@authhero/adapter-interfaces";
import { customText } from "../schema/sqlite";
import type { DrizzleDb } from "./types";

export function createCustomTextAdapter(db: DrizzleDb) {
  return {
    async get(
      tenant_id: string,
      prompt: string,
      language: string,
    ): Promise<CustomText | null> {
      const result = await db
        .select()
        .from(customText)
        .where(
          and(
            eq(customText.tenant_id, tenant_id),
            eq(customText.prompt, prompt),
            eq(customText.language, language),
          ),
        )
        .get();

      if (!result) return null;

      try {
        return JSON.parse(result.custom_text);
      } catch {
        return null;
      }
    },

    async set(
      tenant_id: string,
      prompt: string,
      language: string,
      data: CustomText,
    ): Promise<void> {
      const now = Date.now();
      const stringified = JSON.stringify(data);

      // Check if exists
      const existing = await db
        .select({ tenant_id: customText.tenant_id })
        .from(customText)
        .where(
          and(
            eq(customText.tenant_id, tenant_id),
            eq(customText.prompt, prompt),
            eq(customText.language, language),
          ),
        )
        .get();

      if (existing) {
        await db
          .update(customText)
          .set({ custom_text: stringified, updated_at_ts: now })
          .where(
            and(
              eq(customText.tenant_id, tenant_id),
              eq(customText.prompt, prompt),
              eq(customText.language, language),
            ),
          );
      } else {
        await db.insert(customText).values({
          tenant_id,
          prompt,
          language,
          custom_text: stringified,
          created_at_ts: now,
          updated_at_ts: now,
        });
      }
    },

    async delete(
      tenant_id: string,
      prompt: string,
      language: string,
    ): Promise<void> {
      await db
        .delete(customText)
        .where(
          and(
            eq(customText.tenant_id, tenant_id),
            eq(customText.prompt, prompt),
            eq(customText.language, language),
          ),
        );
    },

    async list(
      tenant_id: string,
    ): Promise<Array<{ prompt: string; language: string }>> {
      const results = await db
        .select({
          prompt: customText.prompt,
          language: customText.language,
        })
        .from(customText)
        .where(eq(customText.tenant_id, tenant_id))
        .all();

      return results;
    },
  };
}
