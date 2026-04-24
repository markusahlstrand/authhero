import {
  ClientRegistrationTokensAdapter,
  ClientRegistrationToken,
  ClientRegistrationTokenInsert,
  ClientRegistrationTokenType,
  clientRegistrationTokenSchema,
} from "@authhero/adapter-interfaces";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { clientRegistrationTokenKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryItems,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface ClientRegistrationTokenItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  token_hash: string;
  type: ClientRegistrationTokenType;
  client_id?: string;
  sub?: string;
  constraints?: string; // JSON string
  single_use: boolean;
  expires_at?: string;
  used_at?: string;
  revoked_at?: string;
}

function toToken(item: ClientRegistrationTokenItem): ClientRegistrationToken {
  const { tenant_id, constraints, ...rest } = stripDynamoDBFields(item);
  const data = removeNullProperties({
    ...rest,
    constraints: constraints ? JSON.parse(constraints) : undefined,
  });
  return clientRegistrationTokenSchema.parse(data);
}

export function createClientRegistrationTokensAdapter(
  ctx: DynamoDBContext,
): ClientRegistrationTokensAdapter {
  return {
    async create(
      tenantId: string,
      token: ClientRegistrationTokenInsert,
    ): Promise<ClientRegistrationToken> {
      const now = new Date().toISOString();

      const item: ClientRegistrationTokenItem = {
        PK: clientRegistrationTokenKeys.pk(tenantId),
        SK: clientRegistrationTokenKeys.sk(token.id),
        GSI1PK: clientRegistrationTokenKeys.gsi1pk(tenantId, token.token_hash),
        GSI1SK: clientRegistrationTokenKeys.gsi1sk(),
        entityType: "CLIENT_REGISTRATION_TOKEN",
        tenant_id: tenantId,
        id: token.id,
        token_hash: token.token_hash,
        type: token.type,
        client_id: token.client_id,
        sub: token.sub,
        constraints: token.constraints
          ? JSON.stringify(token.constraints)
          : undefined,
        single_use: token.single_use,
        expires_at: token.expires_at,
        created_at: now,
        updated_at: now,
      };

      if (token.client_id) {
        item.GSI2PK = clientRegistrationTokenKeys.gsi2pk(
          tenantId,
          token.client_id,
        );
        item.GSI2SK = clientRegistrationTokenKeys.gsi2sk(token.id);
      }

      if (token.expires_at) {
        item.ttl = Math.floor(new Date(token.expires_at).getTime() / 1000);
      }

      await putItem(ctx, item);

      return toToken(item);
    },

    async get(tenantId, id) {
      const item = await getItem<ClientRegistrationTokenItem>(
        ctx,
        clientRegistrationTokenKeys.pk(tenantId),
        clientRegistrationTokenKeys.sk(id),
      );
      return item ? toToken(item) : null;
    },

    async getByHash(tenantId, tokenHash) {
      const result = await queryItems<ClientRegistrationTokenItem>(
        ctx,
        clientRegistrationTokenKeys.gsi1pk(tenantId, tokenHash),
        {
          indexName: "GSI1",
          skValue: clientRegistrationTokenKeys.gsi1sk(),
          limit: 1,
        },
      );
      return result.items[0] ? toToken(result.items[0]) : null;
    },

    async listByClient(tenantId, clientId) {
      const result = await queryItems<ClientRegistrationTokenItem>(
        ctx,
        clientRegistrationTokenKeys.gsi2pk(tenantId, clientId),
        {
          indexName: "GSI2",
          skPrefix: clientRegistrationTokenKeys.skPrefix(),
          scanIndexForward: false,
        },
      );
      return result.items.map(toToken);
    },

    async markUsed(tenantId, id, used_at) {
      try {
        await ctx.client.send(
          new UpdateCommand({
            TableName: ctx.tableName,
            Key: {
              PK: clientRegistrationTokenKeys.pk(tenantId),
              SK: clientRegistrationTokenKeys.sk(id),
            },
            UpdateExpression:
              "SET #used_at = :used_at, #updated_at = :updated_at",
            ConditionExpression:
              "attribute_exists(PK) AND attribute_not_exists(#used_at)",
            ExpressionAttributeNames: {
              "#used_at": "used_at",
              "#updated_at": "updated_at",
            },
            ExpressionAttributeValues: {
              ":used_at": used_at,
              ":updated_at": new Date().toISOString(),
            },
          }),
        );
        return true;
      } catch (err: unknown) {
        if (
          (err as { name?: string })?.name === "ConditionalCheckFailedException"
        ) {
          return false;
        }
        throw err;
      }
    },

    async revoke(tenantId, id, revoked_at) {
      try {
        await ctx.client.send(
          new UpdateCommand({
            TableName: ctx.tableName,
            Key: {
              PK: clientRegistrationTokenKeys.pk(tenantId),
              SK: clientRegistrationTokenKeys.sk(id),
            },
            UpdateExpression:
              "SET #revoked_at = :revoked_at, #updated_at = :updated_at",
            ConditionExpression: "attribute_exists(PK)",
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
        return true;
      } catch (err: unknown) {
        if (
          (err as { name?: string })?.name === "ConditionalCheckFailedException"
        ) {
          return false;
        }
        throw err;
      }
    },

    async revokeByClient(tenantId, clientId, revoked_at) {
      const result = await queryItems<ClientRegistrationTokenItem>(
        ctx,
        clientRegistrationTokenKeys.gsi2pk(tenantId, clientId),
        {
          indexName: "GSI2",
          skPrefix: clientRegistrationTokenKeys.skPrefix(),
        },
      );

      let count = 0;
      const now = new Date().toISOString();
      for (const item of result.items) {
        if (item.revoked_at) continue;
        try {
          await ctx.client.send(
            new UpdateCommand({
              TableName: ctx.tableName,
              Key: { PK: item.PK, SK: item.SK },
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
                ":updated_at": now,
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
      return count;
    },

    async remove(tenantId, id) {
      return deleteItem(
        ctx,
        clientRegistrationTokenKeys.pk(tenantId),
        clientRegistrationTokenKeys.sk(id),
      );
    },
  };
}
