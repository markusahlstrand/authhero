import { eq } from "drizzle-orm";
import type { EmailProvider } from "@authhero/adapter-interfaces";
import { emailProviders } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import type { DrizzleDb } from "./types";

export function createEmailProvidersAdapter(
  db: DrizzleDb,
) {
  return {
    async create(tenant_id: string, data: EmailProvider): Promise<void> {
      const now = new Date().toISOString();
      await db.insert(emailProviders).values({
        tenant_id,
        name: data.name,
        enabled: data.enabled,
        default_from_address: data.default_from_address,
        credentials: JSON.stringify(data.credentials || {}),
        settings: JSON.stringify(data.settings || {}),
        created_at: now,
        updated_at: now,
      });
    },

    async get(tenant_id: string): Promise<EmailProvider | null> {
      const result = await db
        .select()
        .from(emailProviders)
        .where(eq(emailProviders.tenant_id, tenant_id))
        .get();

      if (!result) return null;

      const { tenant_id: _, ...rest } = result;

      return removeNullProperties({
        ...rest,
        enabled: !!rest.enabled,
        credentials: parseJsonIfString(rest.credentials, {}),
        settings: parseJsonIfString(rest.settings, {}),
      });
    },

    async update(tenant_id: string, data: Partial<EmailProvider>): Promise<void> {
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (data.name !== undefined) updateData.name = data.name;
      if (data.enabled !== undefined) updateData.enabled = data.enabled;
      if (data.default_from_address !== undefined)
        updateData.default_from_address = data.default_from_address;
      if (data.credentials !== undefined)
        updateData.credentials = JSON.stringify(data.credentials);
      if (data.settings !== undefined)
        updateData.settings = JSON.stringify(data.settings);

      await db
        .update(emailProviders)
        .set(updateData)
        .where(eq(emailProviders.tenant_id, tenant_id));
    },

    async remove(tenant_id: string): Promise<void> {
      await db
        .delete(emailProviders)
        .where(eq(emailProviders.tenant_id, tenant_id));
    },
  };
}
