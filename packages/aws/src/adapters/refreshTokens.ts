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
  queryItems,
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
  // Auth0's `session_id`. Revocation semantics only — never a cascade key.
  session_id?: string;
  // Auth-event facts denormalised from the login session at mint time.
  organization?: string;
  auth_connection?: string;
  auth_strategy?: { strategy: string; strategy_type: string };
  client_id: string;
  expires_at?: string;
  idle_expires_at?: string;
  last_exchanged_at?: string;
  device: string; // JSON string
  resource_servers: string; // JSON array string
  rotating: boolean;
  token_lookup?: string;
  token_hash?: string;
  family_id?: string;
  rotated_to?: string;
  rotated_at?: string;
  revoked_at?: string;
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
        session_id: refreshToken.session_id,
        organization: refreshToken.organization,
        auth_connection: refreshToken.auth_connection,
        auth_strategy: refreshToken.auth_strategy,
        client_id: refreshToken.client_id,
        expires_at: refreshToken.expires_at,
        idle_expires_at: refreshToken.idle_expires_at,
        last_exchanged_at: refreshToken.last_exchanged_at,
        device: JSON.stringify(refreshToken.device),
        resource_servers: JSON.stringify(refreshToken.resource_servers),
        rotating: refreshToken.rotating,
        token_lookup: refreshToken.token_lookup,
        token_hash: refreshToken.token_hash,
        family_id: refreshToken.family_id,
        rotated_to: refreshToken.rotated_to,
        rotated_at: refreshToken.rotated_at,
        created_at: now,
        updated_at: now,
      };

      // Wire up GSI2 for token_lookup → row resolution on the refresh-grant
      // path. Only set when present; legacy rows without a lookup remain
      // resolvable only via primary key.
      if (refreshToken.token_lookup) {
        item.GSI2PK = refreshTokenKeys.gsi2pk(
          tenantId,
          refreshToken.token_lookup,
        );
        item.GSI2SK = refreshTokenKeys.gsi2sk();
      }

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

    async getByLookup(
      tenantId: string,
      tokenLookup: string,
    ): Promise<RefreshToken | null> {
      const result = await queryItems<RefreshTokenItem>(
        ctx,
        refreshTokenKeys.gsi2pk(tenantId, tokenLookup),
        {
          indexName: "GSI2",
          skValue: refreshTokenKeys.gsi2sk(),
          limit: 1,
        },
      );
      return result.items[0] ? toRefreshToken(result.items[0]) : null;
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

    async revokeByUser(
      tenantId: string,
      user_id: string,
      revoked_at: string,
    ): Promise<number> {
      // Mirrors revokeByLoginSession: no GSI to match on, so iterate the
      // tenant's refresh tokens and soft-revoke the ones for this user. The
      // match is an exact comparison, never a `q` filter.
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
          if (item.user_id !== user_id) continue;
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
                // Also the concurrency guard: a second bulk revocation cannot
                // overwrite the first one's audit timestamp.
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

    async revokeFamily(
      tenantId: string,
      family_id: string,
      revoked_at: string,
    ): Promise<number> {
      // No dedicated GSI for family_id; scan tenant refresh tokens and
      // soft-revoke siblings whose family_id matches and that aren't already
      // revoked.
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
          if (item.family_id !== family_id) continue;
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
