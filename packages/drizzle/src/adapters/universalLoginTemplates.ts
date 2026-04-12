import { eq } from "drizzle-orm";
import type { UniversalLoginTemplate } from "@authhero/adapter-interfaces";
import { universalLoginTemplates } from "../schema/sqlite";
import type { DrizzleDb } from "./types";

export function createUniversalLoginTemplatesAdapter(db: DrizzleDb) {
  return {
    async get(tenant_id: string): Promise<UniversalLoginTemplate | null> {
      const result = await db
        .select({ body: universalLoginTemplates.body })
        .from(universalLoginTemplates)
        .where(eq(universalLoginTemplates.tenant_id, tenant_id))
        .get();

      if (!result) return null;

      return { body: result.body };
    },

    async set(
      tenant_id: string,
      template: UniversalLoginTemplate,
    ): Promise<void> {
      const now = Date.now();
      await db
        .insert(universalLoginTemplates)
        .values({
          tenant_id,
          body: template.body,
          created_at_ts: now,
          updated_at_ts: now,
        })
        .onConflictDoUpdate({
          target: universalLoginTemplates.tenant_id,
          set: {
            body: template.body,
            updated_at_ts: now,
          },
        });
    },

    async delete(tenant_id: string): Promise<void> {
      await db
        .delete(universalLoginTemplates)
        .where(eq(universalLoginTemplates.tenant_id, tenant_id));
    },
  };
}
