import {
  BrandingAdapter,
  Branding,
  brandingSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { brandingKeys, universalLoginTemplateKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface BrandingItem extends DynamoDBBaseItem {
  tenant_id: string;
  colors?: string; // JSON string
  favicon_url?: string;
  logo_url?: string;
  powered_by_logo_url?: string;
  font?: string; // JSON string
}

interface UniversalLoginTemplateItem extends DynamoDBBaseItem {
  tenant_id: string;
  template: string;
}

function toBranding(item: BrandingItem): Branding {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);

  const data = removeNullProperties({
    ...rest,
    colors: item.colors ? JSON.parse(item.colors) : undefined,
    font: item.font ? JSON.parse(item.font) : undefined,
  });

  return brandingSchema.parse(data);
}

export function createBrandingAdapter(ctx: DynamoDBContext): BrandingAdapter {
  return {
    async set(tenantId: string, branding: Branding): Promise<void> {
      const now = new Date().toISOString();

      // Fetch existing item to preserve created_at
      const existing = await getItem<BrandingItem>(
        ctx,
        brandingKeys.pk(tenantId),
        brandingKeys.sk(),
      );

      const item: BrandingItem = {
        PK: brandingKeys.pk(tenantId),
        SK: brandingKeys.sk(),
        entityType: "BRANDING",
        tenant_id: tenantId,
        colors: branding.colors ? JSON.stringify(branding.colors) : undefined,
        favicon_url: branding.favicon_url,
        logo_url: branding.logo_url,
        powered_by_logo_url: branding.powered_by_logo_url,
        font: branding.font ? JSON.stringify(branding.font) : undefined,
        created_at: existing?.created_at || now,
        updated_at: now,
      };

      await putItem(ctx, item);
    },

    async get(tenantId: string): Promise<Branding | null> {
      const item = await getItem<BrandingItem>(
        ctx,
        brandingKeys.pk(tenantId),
        brandingKeys.sk(),
      );

      if (!item) return null;

      return toBranding(item);
    },

    async setUniversalLoginTemplate(
      tenantId: string,
      template: string,
    ): Promise<void> {
      const now = new Date().toISOString();

      // Fetch existing item to preserve created_at
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
        template,
        created_at: existing?.created_at || now,
        updated_at: now,
      };

      await putItem(ctx, item);
    },

    async getUniversalLoginTemplate(tenantId: string): Promise<string | null> {
      const item = await getItem<UniversalLoginTemplateItem>(
        ctx,
        universalLoginTemplateKeys.pk(tenantId),
        universalLoginTemplateKeys.sk(),
      );

      if (!item) return null;

      return item.template;
    },

    async deleteUniversalLoginTemplate(tenantId: string): Promise<void> {
      await deleteItem(
        ctx,
        universalLoginTemplateKeys.pk(tenantId),
        universalLoginTemplateKeys.sk(),
      );
    },
  };
}
