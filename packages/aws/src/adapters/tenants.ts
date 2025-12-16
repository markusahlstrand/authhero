import { nanoid } from "nanoid";
import {
  TenantsDataAdapter,
  Tenant,
  CreateTenantParams,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { tenantKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryItems,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface TenantItem extends DynamoDBBaseItem, Omit<Tenant, "created_at" | "updated_at"> {
  GSI1PK: string;
  GSI1SK: string;
}

function toTenant(item: TenantItem): Tenant {
  const stripped = stripDynamoDBFields(item);
  return removeNullProperties(stripped) as Tenant;
}

export function createTenantsAdapter(ctx: DynamoDBContext): TenantsDataAdapter {
  return {
    async create(params: CreateTenantParams): Promise<Tenant> {
      const now = new Date().toISOString();
      const id = params.id || nanoid();

      const item: TenantItem = {
        PK: tenantKeys.pk(id),
        SK: tenantKeys.sk(),
        GSI1PK: tenantKeys.gsi1pk(),
        GSI1SK: tenantKeys.gsi1sk(id),
        entityType: "TENANT",
        id,
        audience: params.audience,
        friendly_name: params.friendly_name,
        sender_name: params.sender_name,
        sender_email: params.sender_email,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toTenant(item);
    },

    async get(id: string): Promise<Tenant | null> {
      const item = await getItem<TenantItem>(
        ctx,
        tenantKeys.pk(id),
        tenantKeys.sk(),
      );

      if (!item) return null;

      return toTenant(item);
    },

    async list(params = {}): Promise<{ tenants: Tenant[]; totals?: { start: number; limit: number; length: number } }> {
      const { page = 0, per_page = 50, include_totals = false } = params;

      // Query all tenants using GSI1 where all tenants share GSI1PK="TENANTS"
      const { items } = await queryItems<TenantItem>(ctx, tenantKeys.gsi1pk(), {
        indexName: "GSI1",
        limit: per_page,
      });

      const tenants = items.map(toTenant);

      if (include_totals) {
        return {
          tenants,
          totals: {
            start: page * per_page,
            limit: per_page,
            length: tenants.length,
          },
        };
      }

      return { tenants };
    },

    async update(id: string, tenant: Partial<Tenant>): Promise<void> {
      const updates = {
        ...tenant,
        updated_at: new Date().toISOString(),
      };

      await updateItem(ctx, tenantKeys.pk(id), tenantKeys.sk(), updates);
    },

    async remove(id: string): Promise<boolean> {
      return deleteItem(ctx, tenantKeys.pk(id), tenantKeys.sk());
    },
  };
}
