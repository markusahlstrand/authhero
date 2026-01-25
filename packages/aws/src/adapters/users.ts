import { nanoid } from "nanoid";
import {
  UserDataAdapter,
  User,
  UserInsert,
  ListUsersResponse,
  ListParams,
  parseUserId,
  userSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { userKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
  queryItems,
} from "../utils";
import { HTTPException } from "hono/http-exception";

interface UserItem extends DynamoDBBaseItem {
  user_id: string;
  tenant_id: string;
  email?: string;
  username?: string;
  phone_number?: string;
  given_name?: string;
  family_name?: string;
  nickname?: string;
  name?: string;
  picture?: string;
  locale?: string;
  linked_to?: string;
  profileData?: string;
  email_verified: boolean;
  last_ip?: string;
  last_login?: string;
  provider: string;
  connection: string;
  is_social: boolean;
  login_count: number;
  app_metadata: string; // JSON string
  user_metadata: string; // JSON string
  // OIDC profile claims (OIDC Core 5.1)
  middle_name?: string;
  preferred_username?: string;
  profile?: string;
  website?: string;
  gender?: string;
  birthdate?: string;
  zoneinfo?: string;
}

function toUser(item: UserItem, linkedUsers: UserItem[] = []): User {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);
  
  const data = removeNullProperties({
    ...rest,
    app_metadata: JSON.parse(item.app_metadata || "{}"),
    user_metadata: JSON.parse(item.user_metadata || "{}"),
    identities: [
      {
        connection: item.connection,
        provider: item.provider,
        user_id: parseUserId(item.user_id).id,
        isSocial: item.is_social,
      },
      ...linkedUsers.map((u) => ({
        connection: u.connection,
        provider: u.provider,
        user_id: parseUserId(u.user_id).id,
        isSocial: u.is_social,
      })),
    ],
  });

  return userSchema.parse(data);
}

export function createUsersAdapter(ctx: DynamoDBContext): UserDataAdapter {
  return {
    async create(tenantId: string, user: UserInsert): Promise<User> {
      const now = new Date().toISOString();
      const userId = user.user_id || `${user.provider}|${nanoid()}`;

      const item: UserItem = {
        PK: userKeys.pk(tenantId),
        SK: userKeys.sk(userId),
        entityType: "USER",
        tenant_id: tenantId,
        user_id: userId,
        email: user.email,
        username: user.username,
        phone_number: user.phone_number,
        given_name: user.given_name,
        family_name: user.family_name,
        nickname: user.nickname,
        name: user.name,
        picture: user.picture,
        locale: user.locale,
        linked_to: user.linked_to,
        profileData: user.profileData,
        email_verified: user.email_verified ?? false,
        last_ip: user.last_ip,
        last_login: user.last_login,
        provider: user.provider || "auth",
        connection: user.connection,
        is_social: user.is_social ?? false,
        login_count: 0,
        app_metadata: JSON.stringify(user.app_metadata || {}),
        user_metadata: JSON.stringify(user.user_metadata || {}),
        // OIDC profile claims
        middle_name: user.middle_name,
        preferred_username: user.preferred_username,
        profile: user.profile,
        website: user.website,
        gender: user.gender,
        birthdate: user.birthdate,
        zoneinfo: user.zoneinfo,
        created_at: now,
        updated_at: now,
      };

      // Add GSI keys for email lookup if email exists
      if (user.email) {
        (item as any).GSI1PK = userKeys.gsi1pk(tenantId, user.email);
        (item as any).GSI1SK = userKeys.gsi1sk();
      }

      // Add GSI2 keys for connection lookup
      (item as any).GSI2PK = userKeys.gsi2pk(tenantId, user.connection);
      (item as any).GSI2SK = userKeys.gsi2sk(userId);

      try {
        await putItem(ctx, item, {
          conditionExpression: "attribute_not_exists(PK)",
        });
      } catch (err: any) {
        if (err.name === "ConditionalCheckFailedException") {
          throw new HTTPException(409, { message: "User already exists" });
        }
        throw err;
      }

      return toUser(item);
    },

    async get(tenantId: string, userId: string): Promise<User | null> {
      const [item, linkedUsersResult] = await Promise.all([
        getItem<UserItem>(ctx, userKeys.pk(tenantId), userKeys.sk(userId)),
        queryItems<UserItem>(ctx, userKeys.pk(tenantId), {
          skPrefix: "USER#",
        }).then((result) =>
          result.items.filter((u) => u.linked_to === userId),
        ),
      ]);

      if (!item) return null;

      return toUser(item, linkedUsersResult);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListUsersResponse> {
      const result = await queryWithPagination<UserItem>(
        ctx,
        userKeys.pk(tenantId),
        params,
        { skPrefix: "USER#" },
      );

      // Filter out linked users (they have linked_to set)
      const primaryUsers = result.items.filter((u) => !u.linked_to);
      const linkedUsers = result.items.filter((u) => u.linked_to);

      const users = primaryUsers.map((user) => {
        const linkedForUser = linkedUsers.filter(
          (u) => u.linked_to === user.user_id,
        );
        return toUser(user, linkedForUser);
      });

      return {
        users,
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      tenantId: string,
      userId: string,
      user: Partial<User>,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        ...user,
        updated_at: new Date().toISOString(),
      };

      // Handle metadata fields
      if (user.app_metadata !== undefined) {
        updates.app_metadata = JSON.stringify(user.app_metadata);
      }
      if (user.user_metadata !== undefined) {
        updates.user_metadata = JSON.stringify(user.user_metadata);
      }

      // Remove fields that shouldn't be updated
      delete updates.user_id;
      delete updates.identities;

      return updateItem(ctx, userKeys.pk(tenantId), userKeys.sk(userId), updates);
    },

    async remove(tenantId: string, userId: string): Promise<boolean> {
      return deleteItem(ctx, userKeys.pk(tenantId), userKeys.sk(userId));
    },

    async unlink(
      tenantId: string,
      _userId: string,
      provider: string,
      linkedUserId: string,
    ): Promise<boolean> {
      // Find and remove the linked user
      const linkedId = `${provider}|${linkedUserId}`;
      return deleteItem(ctx, userKeys.pk(tenantId), userKeys.sk(linkedId));
    },
  };
}
