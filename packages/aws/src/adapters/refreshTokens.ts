import {
  RefreshTokensAdapter,
  RefreshToken,
  RefreshTokenInsert,
  ListRefreshTokenResponse,
  ListParams,
  UpdateRefreshTokenOptions,
  refreshTokenSchema,
} from "@authhero/adapter-interfaces";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { refreshTokenKeys, loginSessionKeys } from "../keys";
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
  login_id: string;
  client_id: string;
  expires_at?: string;
  idle_expires_at?: string;
  last_exchanged_at?: string;
  device: string; // JSON string
  resource_servers: string; // JSON array string
  rotating: boolean;
}

function toRefreshToken(item: RefreshTokenItem): RefreshToken {
  const { tenant_id, device, resource_servers, ...rest } =
    stripDynamoDBFields(item);

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
        login_id: refreshToken.login_id,
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
      options?: UpdateRefreshTokenOptions,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        ...refreshToken,
        updated_at: new Date().toISOString(),
      };

      if (refreshToken.device !== undefined) {
        updates.device = JSON.stringify(refreshToken.device);
      }
      if (refreshToken.resource_servers !== undefined) {
        updates.resource_servers = JSON.stringify(
          refreshToken.resource_servers,
        );
      }

      // Remove id from updates
      delete updates.id;

      const result = await updateItem(
        ctx,
        refreshTokenKeys.pk(tenantId),
        refreshTokenKeys.sk(id),
        updates,
      );

      if (result && options?.loginSessionBump) {
        // Best-effort login_session bump. Idempotent and self-healing (the
        // next refresh will re-bump on transient failure), so a failure here
        // must not reject the refresh exchange.
        try {
          await updateItem(
            ctx,
            loginSessionKeys.pk(tenantId),
            loginSessionKeys.sk(options.loginSessionBump.login_id),
            {
              expires_at: options.loginSessionBump.expires_at,
              updated_at: new Date().toISOString(),
            },
          );
        } catch {
          // swallow
        }
      }

      return result;
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      return deleteItem(
        ctx,
        refreshTokenKeys.pk(tenantId),
        refreshTokenKeys.sk(id),
      );
    },

    async revokeByLoginSession(
      tenantId: string,
      login_session_id: string,
      revoked_at: string,
    ): Promise<number> {
      // DynamoDB has no GSI on login_id, so iterate tenant refresh tokens and
      // soft-revoke the ones that match.
      let count = 0;
      let page = 0;
      const per_page = 100;
      for (;;) {
        const result = await queryWithPagination<RefreshTokenItem>(
          ctx,
          refreshTokenKeys.pk(tenantId),
          { page, per_page },
          { skPrefix: "REFRESH_TOKEN#" },
        );
        for (const item of result.items) {
          if (item.login_id !== login_session_id) continue;
          if ((item as { revoked_at?: string }).revoked_at) continue;
          try {
            await ctx.client.send(
              new UpdateCommand({
                TableName: ctx.tableName,
                Key: {
                  PK: refreshTokenKeys.pk(tenantId),
                  SK: refreshTokenKeys.sk(item.id),
                },
                UpdateExpression:
                  "SET #revoked_at = :revoked_at, #updated_at = :updated_at",
                ConditionExpression:
                  "attribute_exists(PK) AND attribute_not_exists(#revoked_at)",
                ExpressionAttributeNames: {
                  "#revoked_at": "revoked_at",
                  "#updated_at": "updated_at",
                },
                ExpressionAttributeValues: {
                  ":revoked_at": revoked_at,
                  ":updated_at": new Date().toISOString(),
                },
              }),
            );
            count++;
          } catch (err: unknown) {
            if (
              (err as { name?: string })?.name ===
              "ConditionalCheckFailedException"
            ) {
              continue;
            }
            throw err;
          }
        }
        if (result.items.length < per_page) break;
        page++;
      }
      return count;
    },
  };
}
