import {
  EmailProvidersAdapter,
  EmailProvider,
  emailProviderSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { emailProviderKeys } from "../keys";
import {
  getItem,
  putItem,
  updateItem,
  deleteItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface EmailProviderItem extends DynamoDBBaseItem {
  tenant_id: string;
  name: string;
  enabled: boolean;
  default_from_address?: string;
  credentials?: string; // JSON string
  settings?: string; // JSON string
}

function toEmailProvider(item: EmailProviderItem): EmailProvider {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);

  const data = removeNullProperties({
    ...rest,
    credentials: item.credentials ? JSON.parse(item.credentials) : undefined,
    settings: item.settings ? JSON.parse(item.settings) : undefined,
  });

  return emailProviderSchema.parse(data);
}

export function createEmailProvidersAdapter(
  ctx: DynamoDBContext,
): EmailProvidersAdapter {
  return {
    async create(tenantId: string, emailProvider: EmailProvider): Promise<void> {
      const now = new Date().toISOString();

      const item: EmailProviderItem = {
        PK: emailProviderKeys.pk(tenantId),
        SK: emailProviderKeys.sk(),
        entityType: "EMAIL_PROVIDER",
        tenant_id: tenantId,
        name: emailProvider.name,
        enabled: emailProvider.enabled ?? true,
        default_from_address: emailProvider.default_from_address,
        credentials: emailProvider.credentials
          ? JSON.stringify(emailProvider.credentials)
          : undefined,
        settings: emailProvider.settings
          ? JSON.stringify(emailProvider.settings)
          : undefined,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);
    },

    async get(tenantId: string): Promise<EmailProvider | null> {
      const item = await getItem<EmailProviderItem>(
        ctx,
        emailProviderKeys.pk(tenantId),
        emailProviderKeys.sk(),
      );

      if (!item) return null;

      return toEmailProvider(item);
    },

    async update(
      tenantId: string,
      emailProvider: Partial<EmailProvider>,
    ): Promise<void> {
      const updates: Record<string, unknown> = {
        ...emailProvider,
        updated_at: new Date().toISOString(),
      };

      if (emailProvider.credentials !== undefined) {
        updates.credentials = JSON.stringify(emailProvider.credentials);
      }
      if (emailProvider.settings !== undefined) {
        updates.settings = JSON.stringify(emailProvider.settings);
      }

      await updateItem(
        ctx,
        emailProviderKeys.pk(tenantId),
        emailProviderKeys.sk(),
        updates,
      );
    },

    async remove(tenantId: string): Promise<void> {
      await deleteItem(
        ctx,
        emailProviderKeys.pk(tenantId),
        emailProviderKeys.sk(),
      );
    },
  };
}
