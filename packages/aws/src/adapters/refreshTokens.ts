import {
  RefreshTokensAdapter,
  RefreshToken,
  RefreshTokenInsert,
  ListRefreshTokenResponse,
  ListParams,
  refreshTokenSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { refreshTokenKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface RefreshTokenItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  user_id: string;
  session_id: string;
  client_id: string;
  expires_at?: string;
  idle_expires_at?: string;
  last_exchanged_at?: string;
  device: string; // JSON string
  resource_servers: string; // JSON array string
  rotating: boolean;
}

function toRefreshToken(item: RefreshTokenItem): RefreshToken {
  const { tenant_id, device, resource_servers, ...rest } = stripDynamoDBFields(item);

  const data = removeNullProperties({
    ...rest,
    device: JSON.parse(device),
    resource_servers: JSON.parse(resource_servers),
  });

  return refreshTokenSchema.parse(data);
}

export function createRefreshTokensAdapter(
  ctx: DynamoDBContext,
): RefreshTokensAdapter {
  return {
    async create(
      tenantId: string,
      refreshToken: RefreshTokenInsert,
    ): Promise<RefreshToken> {
      const now = new Date().toISOString();

      const item: RefreshTokenItem = {
        PK: refreshTokenKeys.pk(tenantId),
        SK: refreshTokenKeys.sk(refreshToken.id),
        GSI1PK: refreshTokenKeys.gsi1pk(tenantId, refreshToken.user_id),
        GSI1SK: refreshTokenKeys.gsi1sk(refreshToken.id),
        entityType: "REFRESH_TOKEN",
        tenant_id: tenantId,
        id: refreshToken.id,
        user_id: refreshToken.user_id,
        session_id: refreshToken.session_id,
        client_id: refreshToken.client_id,
        expires_at: refreshToken.expires_at,
        idle_expires_at: refreshToken.idle_expires_at,
        last_exchanged_at: refreshToken.last_exchanged_at,
        device: JSON.stringify(refreshToken.device),
        resource_servers: JSON.stringify(refreshToken.resource_servers),
        rotating: refreshToken.rotating,
        created_at: now,
        updated_at: now,
      };

      // Set TTL for automatic expiration if expires_at is set
      if (refreshToken.expires_at) {
        (item as any).ttl = Math.floor(
          new Date(refreshToken.expires_at).getTime() / 1000,
        );
      }

      await putItem(ctx, item);

      return toRefreshToken(item);
    },

    async get(tenantId: string, id: string): Promise<RefreshToken | null> {
      const item = await getItem<RefreshTokenItem>(
        ctx,
        refreshTokenKeys.pk(tenantId),
        refreshTokenKeys.sk(id),
      );

      if (!item) return null;

      return toRefreshToken(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListRefreshTokenResponse> {
      const result = await queryWithPagination<RefreshTokenItem>(
        ctx,
        refreshTokenKeys.pk(tenantId),
        params,
        { skPrefix: "REFRESH_TOKEN#" },
      );

      return {
        refresh_tokens: result.items.map(toRefreshToken),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      tenantId: string,
      id: string,
      refreshToken: Partial<RefreshToken>,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        ...refreshToken,
        updated_at: new Date().toISOString(),
      };

      if (refreshToken.device !== undefined) {
        updates.device = JSON.stringify(refreshToken.device);
      }
      if (refreshToken.resource_servers !== undefined) {
        updates.resource_servers = JSON.stringify(refreshToken.resource_servers);
      }

      // Remove id from updates
      delete updates.id;

      return updateItem(
        ctx,
        refreshTokenKeys.pk(tenantId),
        refreshTokenKeys.sk(id),
        updates,
      );
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      return deleteItem(
        ctx,
        refreshTokenKeys.pk(tenantId),
        refreshTokenKeys.sk(id),
      );
    },
  };
}
