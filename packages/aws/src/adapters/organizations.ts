import { nanoid } from "nanoid";
import {
  OrganizationsAdapter,
  Organization,
  OrganizationInsert,
  ListOrganizationsResponse,
  ListParams,
  organizationSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { organizationKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface OrganizationItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  name: string;
  display_name?: string;
  branding?: string; // JSON string
  metadata?: string; // JSON string
  enabled_connections?: string; // JSON array string
  token_quota?: string; // JSON string
}

function toOrganization(item: OrganizationItem): Organization {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);

  const data = removeNullProperties({
    ...rest,
    branding: item.branding ? JSON.parse(item.branding) : undefined,
    metadata: item.metadata ? JSON.parse(item.metadata) : undefined,
    enabled_connections: item.enabled_connections
      ? JSON.parse(item.enabled_connections)
      : undefined,
    token_quota: item.token_quota ? JSON.parse(item.token_quota) : undefined,
  });

  return organizationSchema.parse(data);
}

export function createOrganizationsAdapter(
  ctx: DynamoDBContext,
): OrganizationsAdapter {
  return {
    async create(
      tenantId: string,
      params: OrganizationInsert,
    ): Promise<Organization> {
      const now = new Date().toISOString();
      const id = params.id || nanoid();

      const item: OrganizationItem = {
        PK: organizationKeys.pk(tenantId),
        SK: organizationKeys.sk(id),
        GSI1PK: organizationKeys.gsi1pk(tenantId, params.name),
        GSI1SK: organizationKeys.gsi1sk(),
        entityType: "ORGANIZATION",
        tenant_id: tenantId,
        id,
        name: params.name,
        display_name: params.display_name,
        branding: params.branding ? JSON.stringify(params.branding) : undefined,
        metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
        enabled_connections: params.enabled_connections
          ? JSON.stringify(params.enabled_connections)
          : undefined,
        token_quota: params.token_quota
          ? JSON.stringify(params.token_quota)
          : undefined,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toOrganization(item);
    },

    async get(tenantId: string, id: string): Promise<Organization | null> {
      // First try to find by ID
      let item = await getItem<OrganizationItem>(
        ctx,
        organizationKeys.pk(tenantId),
        organizationKeys.sk(id),
      );

      // If not found by ID, try to find by name using GSI1
      if (!item) {
        const result = await queryWithPagination<OrganizationItem>(
          ctx,
          organizationKeys.gsi1pk(tenantId, id),
          { page: 0, perPage: 1 },
          { indexName: "GSI1", skPrefix: "ORGANIZATION" },
        );
        item = result.items[0] || null;
      }

      if (!item) return null;

      return toOrganization(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListOrganizationsResponse> {
      const result = await queryWithPagination<OrganizationItem>(
        ctx,
        organizationKeys.pk(tenantId),
        params,
        { skPrefix: "ORGANIZATION#" },
      );

      return {
        organizations: result.items.map(toOrganization),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      tenantId: string,
      id: string,
      params: Partial<OrganizationInsert>,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        ...params,
        updated_at: new Date().toISOString(),
      };

      if (params.branding !== undefined) {
        updates.branding = JSON.stringify(params.branding);
      }
      if (params.metadata !== undefined) {
        updates.metadata = JSON.stringify(params.metadata);
      }
      if (params.enabled_connections !== undefined) {
        updates.enabled_connections = JSON.stringify(params.enabled_connections);
      }
      if (params.token_quota !== undefined) {
        updates.token_quota = JSON.stringify(params.token_quota);
      }

      // Remove id from updates
      delete updates.id;

      return updateItem(
        ctx,
        organizationKeys.pk(tenantId),
        organizationKeys.sk(id),
        updates,
      );
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      return deleteItem(
        ctx,
        organizationKeys.pk(tenantId),
        organizationKeys.sk(id),
      );
    },
  };
}
