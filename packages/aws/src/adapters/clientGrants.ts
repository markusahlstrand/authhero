import { nanoid } from "nanoid";
import {
  ClientGrantsAdapter,
  ClientGrant,
  ClientGrantInsert,
  ListClientGrantsResponse,
  ListParams,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { clientGrantKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface ClientGrantItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  client_id: string;
  audience: string;
  scope?: string; // JSON array string
  organization_usage?: string;
  allow_any_organization?: boolean;
  is_system?: boolean;
  subject_type?: string;
  authorization_details_types?: string; // JSON array string
}

function toClientGrant(item: ClientGrantItem): ClientGrant {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);

  return removeNullProperties({
    ...rest,
    scope: item.scope ? JSON.parse(item.scope) : undefined,
    authorization_details_types: item.authorization_details_types
      ? JSON.parse(item.authorization_details_types)
      : undefined,
  }) as ClientGrant;
}

export function createClientGrantsAdapter(
  ctx: DynamoDBContext,
): ClientGrantsAdapter {
  return {
    async create(
      tenantId: string,
      params: ClientGrantInsert,
    ): Promise<ClientGrant> {
      const now = new Date().toISOString();
      const id = nanoid();

      const item: ClientGrantItem = {
        PK: clientGrantKeys.pk(tenantId),
        SK: clientGrantKeys.sk(id),
        GSI1PK: clientGrantKeys.gsi1pk(tenantId, params.client_id),
        GSI1SK: clientGrantKeys.gsi1sk(params.audience),
        entityType: "CLIENT_GRANT",
        tenant_id: tenantId,
        id,
        client_id: params.client_id,
        audience: params.audience,
        scope: params.scope ? JSON.stringify(params.scope) : undefined,
        organization_usage: params.organization_usage,
        allow_any_organization: params.allow_any_organization,
        is_system: params.is_system,
        subject_type: params.subject_type,
        authorization_details_types: params.authorization_details_types
          ? JSON.stringify(params.authorization_details_types)
          : undefined,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toClientGrant(item);
    },

    async get(tenantId: string, id: string): Promise<ClientGrant | null> {
      const item = await getItem<ClientGrantItem>(
        ctx,
        clientGrantKeys.pk(tenantId),
        clientGrantKeys.sk(id),
      );

      if (!item) return null;

      return toClientGrant(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListClientGrantsResponse> {
      const result = await queryWithPagination<ClientGrantItem>(
        ctx,
        clientGrantKeys.pk(tenantId),
        params,
        { skPrefix: "CLIENT_GRANT#" },
      );

      return {
        client_grants: result.items.map(toClientGrant),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      tenantId: string,
      id: string,
      clientGrant: Partial<ClientGrantInsert>,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        ...clientGrant,
        updated_at: new Date().toISOString(),
      };

      if (clientGrant.scope !== undefined) {
        updates.scope = JSON.stringify(clientGrant.scope);
      }
      if (clientGrant.authorization_details_types !== undefined) {
        updates.authorization_details_types = JSON.stringify(
          clientGrant.authorization_details_types,
        );
      }

      // Remove id from updates
      delete updates.id;

      return updateItem(
        ctx,
        clientGrantKeys.pk(tenantId),
        clientGrantKeys.sk(id),
        updates,
      );
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      return deleteItem(
        ctx,
        clientGrantKeys.pk(tenantId),
        clientGrantKeys.sk(id),
      );
    },
  };
}
