import { nanoid } from "nanoid";
import {
  UserOrganizationsAdapter,
  UserOrganization,
  UserOrganizationInsert,
  Organization,
  Totals,
  ListParams,
  userOrganizationSchema,
  organizationSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { userOrganizationKeys, organizationKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface UserOrganizationItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  user_id: string;
  organization_id: string;
}

interface OrganizationItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  name: string;
  display_name?: string;
  branding?: string;
  metadata?: string;
  enabled_connections?: string;
  token_quota?: string;
}

function toUserOrganization(item: UserOrganizationItem): UserOrganization {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);
  return userOrganizationSchema.parse(removeNullProperties(rest));
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

export function createUserOrganizationsAdapter(
  ctx: DynamoDBContext,
): UserOrganizationsAdapter {
  return {
    async create(
      tenantId: string,
      params: UserOrganizationInsert,
    ): Promise<UserOrganization> {
      const now = new Date().toISOString();
      const id = nanoid();

      const item: UserOrganizationItem = {
        PK: userOrganizationKeys.pk(tenantId),
        SK: userOrganizationKeys.sk(id),
        GSI1PK: userOrganizationKeys.gsi1pk(tenantId, params.user_id),
        GSI1SK: userOrganizationKeys.gsi1sk(params.organization_id),
        GSI2PK: userOrganizationKeys.gsi2pk(tenantId, params.organization_id),
        GSI2SK: userOrganizationKeys.gsi2sk(params.user_id),
        entityType: "USER_ORGANIZATION",
        tenant_id: tenantId,
        id,
        user_id: params.user_id,
        organization_id: params.organization_id,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toUserOrganization(item);
    },

    async get(tenantId: string, id: string): Promise<UserOrganization | null> {
      const item = await getItem<UserOrganizationItem>(
        ctx,
        userOrganizationKeys.pk(tenantId),
        userOrganizationKeys.sk(id),
      );

      if (!item) return null;

      return toUserOrganization(item);
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      return deleteItem(
        ctx,
        userOrganizationKeys.pk(tenantId),
        userOrganizationKeys.sk(id),
      );
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<{ userOrganizations: UserOrganization[] } & Totals> {
      const result = await queryWithPagination<UserOrganizationItem>(
        ctx,
        userOrganizationKeys.pk(tenantId),
        params,
        { skPrefix: "USER_ORG#" },
      );

      return {
        userOrganizations: result.items.map(toUserOrganization),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async listUserOrganizations(
      tenantId: string,
      userId: string,
      params: ListParams = {},
    ): Promise<{ organizations: Organization[] } & Totals> {
      // Query by user using GSI1 with pagination
      const result = await queryWithPagination<UserOrganizationItem>(
        ctx,
        userOrganizationKeys.gsi1pk(tenantId, userId),
        params,
        {
          indexName: "GSI1",
          skPrefix: "USER_ORG#",
        },
      );

      // Fetch the actual organization details for the paginated results
      const organizations: Organization[] = [];
      for (const userOrg of result.items) {
        const orgItem = await getItem<OrganizationItem>(
          ctx,
          organizationKeys.pk(tenantId),
          organizationKeys.sk(userOrg.organization_id),
        );
        if (orgItem) {
          organizations.push(toOrganization(orgItem));
        }
      }

      return {
        organizations,
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      tenantId: string,
      id: string,
      params: Partial<UserOrganizationInsert>,
    ): Promise<boolean> {
      const updates = {
        ...params,
        updated_at: new Date().toISOString(),
      };

      return updateItem(
        ctx,
        userOrganizationKeys.pk(tenantId),
        userOrganizationKeys.sk(id),
        updates,
      );
    },
  };
}
