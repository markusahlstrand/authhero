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

interface TenantItem extends DynamoDBBaseItem, Omit<Tenant, "created_at" | "updated_at"> {}

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
      // For tenants, we need to scan all tenants
      // In a real implementation, you might want a GSI for this
      const { page = 0, per_page = 50, include_totals = false } = params;

      // Query all tenants using a scan or a dedicated GSI
      // For simplicity, we'll use a pattern where all tenants share a common prefix
      const { items } = await queryItems<TenantItem>(ctx, "TENANT#", {
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
