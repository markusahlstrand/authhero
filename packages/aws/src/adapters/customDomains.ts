import { nanoid } from "nanoid";
import {
  CustomDomainsAdapter,
  CustomDomain,
  CustomDomainInsert,
  CustomDomainWithTenantId,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { customDomainKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryItems,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface CustomDomainItem extends DynamoDBBaseItem {
  custom_domain_id: string;
  tenant_id: string;
  domain: string;
  primary: boolean;
  status: string;
  type: string;
  origin_domain_name?: string;
  verification?: string; // JSON string
  verification_method?: string;
  custom_client_ip_header?: string;
  tls_policy?: string;
  domain_metadata?: string; // JSON string
}

function toCustomDomain(item: CustomDomainItem): CustomDomain {
  const { tenant_id, verification, domain_metadata, ...rest } = stripDynamoDBFields(item);

  return removeNullProperties({
    ...rest,
    verification: verification ? JSON.parse(verification) : undefined,
    domain_metadata: domain_metadata ? JSON.parse(domain_metadata) : undefined,
  }) as CustomDomain;
}

function toCustomDomainWithTenantId(
  item: CustomDomainItem,
): CustomDomainWithTenantId {
  return {
    ...toCustomDomain(item),
    tenant_id: item.tenant_id,
  };
}

export function createCustomDomainsAdapter(
  ctx: DynamoDBContext,
): CustomDomainsAdapter {
  return {
    async create(
      tenantId: string,
      customDomain: CustomDomainInsert,
    ): Promise<CustomDomain> {
      const now = new Date().toISOString();
      const customDomainId = customDomain.custom_domain_id || nanoid();

      const item: CustomDomainItem = {
        PK: customDomainKeys.pk(tenantId),
        SK: customDomainKeys.sk(customDomainId),
        GSI1PK: customDomainKeys.gsi1pk(customDomain.domain),
        GSI1SK: customDomainKeys.gsi1sk(),
        entityType: "CUSTOM_DOMAIN",
        tenant_id: tenantId,
        custom_domain_id: customDomainId,
        domain: customDomain.domain,
        primary: false, // Defaults to false for new domains
        status: "pending_verification", // Initial status
        type: customDomain.type,
        verification_method: customDomain.verification_method,
        custom_client_ip_header: customDomain.custom_client_ip_header,
        tls_policy: customDomain.tls_policy,
        domain_metadata: customDomain.domain_metadata
          ? JSON.stringify(customDomain.domain_metadata)
          : undefined,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toCustomDomain(item);
    },

    async get(tenantId: string, id: string): Promise<CustomDomain | null> {
      const item = await getItem<CustomDomainItem>(
        ctx,
        customDomainKeys.pk(tenantId),
        customDomainKeys.sk(id),
      );

      if (!item) return null;

      return toCustomDomain(item);
    },

    async getByDomain(domain: string): Promise<CustomDomainWithTenantId | null> {
      const { items } = await queryItems<CustomDomainItem>(
        ctx,
        customDomainKeys.gsi1pk(domain),
        {
          indexName: "GSI1",
          skValue: customDomainKeys.gsi1sk(),
        },
      );

      if (!items.length) return null;

      return toCustomDomainWithTenantId(items[0]!);
    },

    async list(tenantId: string): Promise<CustomDomain[]> {
      const { items } = await queryItems<CustomDomainItem>(
        ctx,
        customDomainKeys.pk(tenantId),
        { skPrefix: "CUSTOM_DOMAIN#" },
      );

      return items.map(toCustomDomain);
    },

    async update(
      tenantId: string,
      id: string,
      customDomain: Partial<CustomDomain>,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        ...customDomain,
        updated_at: new Date().toISOString(),
      };

      if (customDomain.verification !== undefined) {
        updates.verification = JSON.stringify(customDomain.verification);
      }
      if (customDomain.domain_metadata !== undefined) {
        updates.domain_metadata = JSON.stringify(customDomain.domain_metadata);
      }

      // Remove custom_domain_id from updates
      delete updates.custom_domain_id;

      return updateItem(
        ctx,
        customDomainKeys.pk(tenantId),
        customDomainKeys.sk(id),
        updates,
      );
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      return deleteItem(
        ctx,
        customDomainKeys.pk(tenantId),
        customDomainKeys.sk(id),
      );
    },
  };
}
