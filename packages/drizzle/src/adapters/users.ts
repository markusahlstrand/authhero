import {
  eq,
  and,
  count as countFn,
  asc,
  desc,
  inArray,
  isNull,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import { HTTPException } from "hono/http-exception";
import type { User, ListParams } from "@authhero/adapter-interfaces";
import { users, passwords, authenticationMethods } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import { buildLuceneFilter } from "../helpers/filter";
import type { DrizzleDb } from "./types";

function userToIdentity(sqlUser: any, isPrimary: boolean) {
  const identity: any = {
    connection: sqlUser.connection,
    provider: sqlUser.provider,
    user_id: sqlUser.user_id,
    isSocial: !!sqlUser.is_social,
  };

  if (isPrimary) {
    identity.isPrimary = true;
  } else {
    identity.profileData = {
      email: sqlUser.email,
      email_verified: !!sqlUser.email_verified,
      ...(typeof sqlUser.profileData === "string"
        ? parseJsonIfString(sqlUser.profileData, {})
        : {}),
    };
  }

  return identity;
}

function sqlToUser(sqlUser: any, linkedUsers: any[] = []): User {
  const {
    tenant_id: _,
    app_metadata,
    user_metadata,
    address,
    email_verified,
    phone_verified,
    is_social,
    linked_to: __,
    profileData: ___,
    ...rest
  } = sqlUser;

  const primaryIdentity = userToIdentity(sqlUser, true);
  const linkedIdentities = linkedUsers.map((u) => userToIdentity(u, false));

  return removeNullProperties({
    ...rest,
    email: sqlUser.email || "",
    email_verified: !!email_verified,
    phone_verified: phone_verified != null ? !!phone_verified : undefined,
    is_social: !!is_social,
    app_metadata: parseJsonIfString(app_metadata, {}),
    user_metadata: parseJsonIfString(user_metadata, {}),
    address: parseJsonIfString(address),
    identities: [primaryIdentity, ...linkedIdentities],
  });
}

export function createUsersAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, params: any): Promise<User> {
      const now = new Date().toISOString();

      const sqlData: any = {
        user_id: params.user_id,
        tenant_id,
        email: params.email,
        given_name: params.given_name,
        family_name: params.family_name,
        nickname: params.nickname,
        name: params.name,
        picture: params.picture,
        tags: params.tags,
        phone_number: params.phone_number,
        phone_verified: params.phone_verified ?? false,
        username: params.username,
        linked_to: params.linked_to,
        last_ip: params.last_ip,
        login_count: params.login_count ?? 0,
        last_login: params.last_login,
        provider: params.provider,
        connection: params.connection,
        email_verified: params.email_verified ?? false,
        is_social: params.is_social ?? false,
        app_metadata: JSON.stringify(params.app_metadata || {}),
        user_metadata: JSON.stringify(params.user_metadata || {}),
        address: params.address ? JSON.stringify(params.address) : undefined,
        profileData: params.profileData
          ? JSON.stringify(params.profileData)
          : undefined,
        locale: params.locale,
        middle_name: params.middle_name,
        preferred_username: params.preferred_username,
        profile: params.profile,
        website: params.website,
        gender: params.gender,
        birthdate: params.birthdate,
        zoneinfo: params.zoneinfo,
        created_at: params.created_at || now,
        updated_at: params.updated_at || now,
      };

      const passwordId = params.password ? nanoid() : undefined;

      try {
        await db.transaction(async (tx) => {
          await tx.insert(users).values(sqlData);

          // Insert password if provided
          if (params.password && passwordId) {
            await tx.insert(passwords).values({
              id: passwordId,
              tenant_id,
              user_id: params.user_id,
              password: params.password.hash || params.password,
              algorithm: params.password.algorithm || "bcrypt",
              is_current: 1,
              created_at: now,
              updated_at: now,
            });
          }
        });
      } catch (error: any) {
        if (
          error?.message?.includes("UNIQUE constraint") ||
          error?.message?.includes("AlreadyExists")
        ) {
          throw new HTTPException(409, { message: "User already exists" });
        }
        throw new HTTPException(500, {
          message: `${error?.code}, ${error?.message}`,
        });
      }

      return sqlToUser(sqlData);
    },

    async get(tenant_id: string, user_id: string): Promise<User | null> {
      const result = await db
        .select()
        .from(users)
        .where(
          and(eq(users.tenant_id, tenant_id), eq(users.user_id, user_id)),
        )
        .get();

      if (!result) return null;

      // Fetch linked users
      const linked = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.tenant_id, tenant_id),
            eq(users.linked_to, user_id),
          ),
        )
        .all();

      return sqlToUser(result, linked);
    },

    async update(
      tenant_id: string,
      user_id: string,
      params: Partial<User>,
    ): Promise<boolean> {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // Simple fields
      const simpleFields = [
        "email",
        "given_name",
        "family_name",
        "nickname",
        "name",
        "picture",
        "tags",
        "phone_number",
        "username",
        "linked_to",
        "last_ip",
        "login_count",
        "last_login",
        "provider",
        "connection",
        "locale",
        "middle_name",
        "preferred_username",
        "profile",
        "website",
        "gender",
        "birthdate",
        "zoneinfo",
      ];
      for (const field of simpleFields) {
        if ((params as any)[field] !== undefined) {
          updateData[field] = (params as any)[field];
        }
      }

      // Boolean fields
      if (params.email_verified !== undefined)
        updateData.email_verified = params.email_verified;
      if (params.phone_verified !== undefined)
        updateData.phone_verified = params.phone_verified;
      if (params.is_social !== undefined)
        updateData.is_social = params.is_social;

      // JSON fields
      if (params.app_metadata !== undefined)
        updateData.app_metadata = JSON.stringify(params.app_metadata);
      if (params.user_metadata !== undefined)
        updateData.user_metadata = JSON.stringify(params.user_metadata);
      if ((params as any).address !== undefined)
        updateData.address = JSON.stringify((params as any).address);
      if (params.profileData !== undefined)
        updateData.profileData = JSON.stringify(params.profileData);

      await db
        .update(users)
        .set(updateData)
        .where(
          and(eq(users.tenant_id, tenant_id), eq(users.user_id, user_id)),
        );

      return true;
    },

    async list(tenant_id: string, params?: ListParams) {
      const { page = 0, per_page = 50, include_totals = false, sort, q } =
        params || {};

      const conditions = [
        eq(users.tenant_id, tenant_id),
        isNull(users.linked_to),
      ];

      if (q) {
        const filter = buildLuceneFilter(users, q, [
          "email",
          "name",
          "nickname",
          "username",
        ]);
        if (filter) conditions.push(filter);
      }

      const whereClause = and(...conditions);

      let query = db
        .select()
        .from(users)
        .where(whereClause)
        .$dynamic();

      if (sort?.sort_by) {
        const col = (users as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);

      // Fetch linked users for these results
      const primaryIds = results.map((r) => r.user_id);

      let allLinked: any[] = [];
      if (primaryIds.length > 0) {
        allLinked = await db
          .select()
          .from(users)
          .where(
            and(
              eq(users.tenant_id, tenant_id),
              inArray(users.linked_to, primaryIds),
            ),
          );
      }

      const mapped = results.map((row) => {
        const linked = allLinked.filter((u) => u.linked_to === row.user_id);
        return sqlToUser(row, linked);
      });

      if (!include_totals) {
        return { users: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(users)
        .where(whereClause);

      return {
        users: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenant_id: string, user_id: string): Promise<boolean> {
      // Collect all user IDs to delete: primary + linked
      const linkedUsers = await db
        .select({ user_id: users.user_id })
        .from(users)
        .where(
          and(eq(users.tenant_id, tenant_id), eq(users.linked_to, user_id)),
        );
      const allUserIds = [
        user_id,
        ...linkedUsers.map((u) => u.user_id),
      ];

      // Delete authentication methods for all users
      await db
        .delete(authenticationMethods)
        .where(
          and(
            eq(authenticationMethods.tenant_id, tenant_id),
            inArray(authenticationMethods.user_id, allUserIds),
          ),
        );

      // Delete passwords for all users
      await db
        .delete(passwords)
        .where(
          and(
            eq(passwords.tenant_id, tenant_id),
            inArray(passwords.user_id, allUserIds),
          ),
        );

      // Delete linked users
      await db
        .delete(users)
        .where(
          and(eq(users.tenant_id, tenant_id), eq(users.linked_to, user_id)),
        );

      // Delete primary user
      const results = await db
        .delete(users)
        .where(
          and(eq(users.tenant_id, tenant_id), eq(users.user_id, user_id)),
        )
        .returning();

      return results.length > 0;
    },

    async unlink(
      tenant_id: string,
      user_id: string,
      provider: string,
      linked_user_id: string,
    ): Promise<boolean> {
      const linkedUserId = `${provider}|${linked_user_id}`;
      await db
        .update(users)
        .set({ linked_to: null })
        .where(
          and(
            eq(users.tenant_id, tenant_id),
            eq(users.user_id, linkedUserId),
            eq(users.linked_to, user_id),
          ),
        );

      return true;
    },
  };
}
