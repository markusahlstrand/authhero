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
import {
  users,
  userActivity,
  passwords,
  authenticationMethods,
} from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import { buildLuceneFilter, sanitizeLuceneQuery } from "../helpers/filter";
import { createUserActivityAdapter } from "./userActivity";
import type { DrizzleDb } from "./types";
import { runAtomic, type AtomicStatementList } from "./atomic";

// Fields users.list() accepts in `q`. Excludes `tenant_id` so a clause like
// `q=tenant_id:other` cannot reach arbitrary columns. Mirrors the kysely
// adapter so both backends behave identically.
const ALLOWED_Q_FIELDS = [
  "user_id",
  "email",
  "email_verified",
  "username",
  "phone_number",
  "phone_verified",
  "name",
  "given_name",
  "family_name",
  "nickname",
  "picture",
  "locale",
  "linked_to",
  "provider",
  "connection",
  "is_social",
  "last_ip",
  "last_login",
  "login_count",
  "created_at",
  "updated_at",
];

// buildLuceneFilter routes bare-string tokens through this list (LIKE search).
const SEARCHABLE_COLUMNS = ["email", "name", "phone_number", "user_id"];

// Activity counters live in the joined user_activity table (issue #1003);
// everything else resolves against users. This map feeds buildLuceneFilter
// and sorting so each public field hits the right table's column.
const ACTIVITY_FIELDS = new Set(["last_login", "last_ip", "login_count"]);

const FILTER_COLUMNS: Record<string, unknown> = Object.fromEntries(
  ALLOWED_Q_FIELDS.map((field) => [
    field,
    ACTIVITY_FIELDS.has(field)
      ? (userActivity as any)[field]
      : (users as any)[field],
  ]),
);

// Join predicate reused by get/list; user_activity is 1:1 with users (PK is
// tenant_id+user_id) so a LEFT JOIN never fans out rows. A missing row means
// the user never logged in.
function activityJoin() {
  return and(
    eq(userActivity.tenant_id, users.tenant_id),
    eq(userActivity.user_id, users.user_id),
  );
}

// Merge a joined row back into the flat user shape sqlToUser expects.
function withActivity<T extends Record<string, unknown>>(
  userRow: T,
  activityRow: {
    last_login: string | null;
    last_ip: string | null;
    login_count: number;
  } | null,
) {
  return {
    ...userRow,
    last_login: activityRow?.last_login,
    last_ip: activityRow?.last_ip,
    login_count: activityRow?.login_count ?? 0,
  };
}

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
  const createImpl = async (tenant_id: string, params: any): Promise<User> => {
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

    // Callers that record a login at creation time (e.g. lazy Auth0
    // migration, social sign-up) pass activity fields — those live in
    // user_activity (issue #1003), not on the users row.
    const hasActivity =
      params.last_login !== undefined ||
      params.last_ip !== undefined ||
      params.login_count !== undefined;

    try {
      // Insert the user and its activity/password rows atomically so all
      // succeed or all roll back. runAtomic uses db.batch() on D1 and
      // BEGIN/COMMIT on better-sqlite3.
      const statements: AtomicStatementList = [
        db.insert(users).values(sqlData),
      ];
      if (hasActivity) {
        statements.push(
          db.insert(userActivity).values({
            tenant_id,
            user_id: params.user_id,
            last_login: params.last_login,
            last_ip: params.last_ip,
            login_count: params.login_count ?? 0,
          }),
        );
      }
      if (params.password && passwordId) {
        statements.push(
          db.insert(passwords).values({
            id: passwordId,
            tenant_id,
            user_id: params.user_id,
            password: params.password.hash || params.password,
            algorithm: params.password.algorithm || "bcrypt",
            is_current: 1,
            created_at: now,
            updated_at: now,
          }),
        );
      }

      if (statements.length > 1) {
        await runAtomic(db, statements);
      } else {
        await db.insert(users).values(sqlData);
      }
    } catch (error: any) {
      if (
        error?.message?.includes("UNIQUE constraint") ||
        error?.message?.includes("AlreadyExists")
      ) {
        throw new HTTPException(409, { message: "User already exists" });
      }
      console.error("User upsert failed:", error?.code, error?.message);
      throw new HTTPException(500, {
        message: "Internal server error",
      });
    }

    return sqlToUser({
      ...sqlData,
      last_login: params.last_login,
      last_ip: params.last_ip,
      login_count: params.login_count ?? 0,
    });
  };

  return {
    create: createImpl,
    rawCreate: createImpl,

    async get(tenant_id: string, user_id: string): Promise<User | null> {
      const result = await db
        .select()
        .from(users)
        .leftJoin(userActivity, activityJoin())
        .where(and(eq(users.tenant_id, tenant_id), eq(users.user_id, user_id)))
        .get();

      if (!result) return null;

      // Fetch linked users
      const linked = await db
        .select()
        .from(users)
        .where(
          and(eq(users.tenant_id, tenant_id), eq(users.linked_to, user_id)),
        )
        .all();

      return sqlToUser(
        withActivity(result.users, result.user_activity),
        linked,
      );
    },

    async update(
      tenant_id: string,
      user_id: string,
      params: Partial<User>,
    ): Promise<boolean> {
      // Activity counters live in user_activity (issue #1003). Route them
      // there so callers that still pass them keep working.
      if (
        params.last_login !== undefined ||
        params.last_ip !== undefined ||
        params.login_count !== undefined
      ) {
        await createUserActivityAdapter(db).upsert(tenant_id, user_id, {
          last_login: params.last_login,
          last_ip: params.last_ip,
          login_count: params.login_count,
        });
      }

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

      const results = await db
        .update(users)
        .set(updateData)
        .where(and(eq(users.tenant_id, tenant_id), eq(users.user_id, user_id)))
        .returning();

      return results.length > 0;
    },

    async list(tenant_id: string, params?: ListParams) {
      const {
        page = 0,
        per_page = 50,
        include_totals = false,
        sort,
        q,
      } = params || {};

      const conditions = [
        eq(users.tenant_id, tenant_id),
        isNull(users.linked_to),
      ];

      if (q) {
        // Sanitize first so only whitelisted fields reach buildLuceneFilter;
        // otherwise a clause like `q=tenant_id:other` would emit SQL against
        // arbitrary columns.
        const sanitized = sanitizeLuceneQuery(q, ALLOWED_Q_FIELDS);
        if (sanitized) {
          const filter = buildLuceneFilter(
            FILTER_COLUMNS,
            sanitized,
            SEARCHABLE_COLUMNS,
          );
          if (filter) conditions.push(filter);
        }
      }

      const whereClause = and(...conditions);

      let query = db
        .select()
        .from(users)
        .leftJoin(userActivity, activityJoin())
        .where(whereClause)
        .$dynamic();

      if (sort?.sort_by) {
        const col = FILTER_COLUMNS[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col as any) : asc(col as any),
          );
        }
      }

      const joinedResults = await query.offset(page * per_page).limit(per_page);
      const results = joinedResults.map((row) =>
        withActivity(row.users, row.user_activity),
      );

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

      // The where clause may reference joined user_activity columns, so the
      // count query needs the same join (1:1, so counts are unaffected).
      const [countResult] = await db
        .select({ count: countFn() })
        .from(users)
        .leftJoin(userActivity, activityJoin())
        .where(whereClause);

      return {
        users: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenant_id: string, user_id: string): Promise<boolean> {
      // Collect all user IDs to delete: primary + linked. This read can sit
      // outside the atomic unit — it mutates nothing, and the deletes it feeds
      // are applied together below.
      const linkedUsers = await db
        .select({ user_id: users.user_id })
        .from(users)
        .where(
          and(eq(users.tenant_id, tenant_id), eq(users.linked_to, user_id)),
        );
      const linkedIds = linkedUsers.map((u) => u.user_id);
      const allUserIds = [user_id, ...linkedIds];

      // Apply the cascade deletes atomically so we never leave a user behind
      // with its auth methods / passwords removed (or vice versa). runAtomic
      // uses db.batch() on D1 and BEGIN/COMMIT on better-sqlite3.
      const results = await runAtomic(db, [
        // Delete authentication methods for all users
        db
          .delete(authenticationMethods)
          .where(
            and(
              eq(authenticationMethods.tenant_id, tenant_id),
              inArray(authenticationMethods.user_id, allUserIds),
            ),
          ),
        // Delete passwords for all users
        db
          .delete(passwords)
          .where(
            and(
              eq(passwords.tenant_id, tenant_id),
              inArray(passwords.user_id, allUserIds),
            ),
          ),
        // Delete activity counters for all users (don't rely on FK cascades —
        // the rest of this cascade is explicit for the same reason)
        db
          .delete(userActivity)
          .where(
            and(
              eq(userActivity.tenant_id, tenant_id),
              inArray(userActivity.user_id, allUserIds),
            ),
          ),
        // Delete linked users — by the same captured IDs the credential
        // deletes above use, so the cascade never diverges from a live
        // `linked_to` predicate if linkage changes between read and batch.
        db
          .delete(users)
          .where(
            and(
              eq(users.tenant_id, tenant_id),
              inArray(users.user_id, linkedIds),
            ),
          ),
        // Delete primary user
        db
          .delete(users)
          .where(
            and(eq(users.tenant_id, tenant_id), eq(users.user_id, user_id)),
          )
          .returning(),
      ]);

      // The primary-user delete is the last statement; its `.returning()` rows
      // tell us whether a row actually existed.
      const primaryDeleteResult = results[results.length - 1];
      return (
        Array.isArray(primaryDeleteResult) && primaryDeleteResult.length > 0
      );
    },

    async unlink(
      tenant_id: string,
      user_id: string,
      provider: string,
      linked_user_id: string,
    ): Promise<boolean> {
      const linkedUserId = `${provider}|${linked_user_id}`;
      const results = await db
        .update(users)
        .set({ linked_to: null })
        .where(
          and(
            eq(users.tenant_id, tenant_id),
            eq(users.user_id, linkedUserId),
            eq(users.linked_to, user_id),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
