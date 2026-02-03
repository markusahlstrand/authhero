import {
  UniversalLoginTemplatesAdapter,
  UniversalLoginTemplate,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { universalLoginTemplateKeys } from "../keys";
import { getItem, putItem, deleteItem } from "../utils";

interface UniversalLoginTemplateItem extends DynamoDBBaseItem {
  tenant_id: string;
  body: string;
}

export function createUniversalLoginTemplatesAdapter(
  ctx: DynamoDBContext,
): UniversalLoginTemplatesAdapter {
  return {
    async get(tenantId: string): Promise<UniversalLoginTemplate | null> {
      const item = await getItem<UniversalLoginTemplateItem>(
        ctx,
        universalLoginTemplateKeys.pk(tenantId),
        universalLoginTemplateKeys.sk(),
      );

      if (!item) return null;

      return { body: item.body };
    },

    async set(
      tenantId: string,
      template: UniversalLoginTemplate,
    ): Promise<void> {
      const now = new Date().toISOString();

      const existing = await getItem<UniversalLoginTemplateItem>(
        ctx,
        universalLoginTemplateKeys.pk(tenantId),
        universalLoginTemplateKeys.sk(),
      );

      const item: UniversalLoginTemplateItem = {
        PK: universalLoginTemplateKeys.pk(tenantId),
        SK: universalLoginTemplateKeys.sk(),
        entityType: "UNIVERSAL_LOGIN_TEMPLATE",
        tenant_id: tenantId,
        body: template.body,
        created_at: existing?.created_at || now,
        updated_at: now,
      };

      await putItem(ctx, item);
    },

    async delete(tenantId: string): Promise<void> {
      await deleteItem(
        ctx,
        universalLoginTemplateKeys.pk(tenantId),
        universalLoginTemplateKeys.sk(),
      );
    },
  };
}
