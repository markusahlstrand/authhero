import { Kysely } from "kysely";
import { removeNullProperties } from "../helpers/remove-nulls";
import { userToIdentity } from "./user-to-identity";
import { Database } from "../db";
import { User } from "@authhero/adapter-interfaces";

export function get(db: Kysely<Database>) {
  return async (tenantId: string, user_id: string): Promise<User | null> => {
    const [sqlUser, linkedUsers] = await Promise.all([
      db
        .selectFrom("users")
        // Activity counters live in user_activity (issue #1003). A missing
        // row means the user never logged in, so LEFT JOIN and coalesce.
        .leftJoin("user_activity", (join) =>
          join
            .onRef("user_activity.tenant_id", "=", "users.tenant_id")
            .onRef("user_activity.user_id", "=", "users.user_id"),
        )
        .where("users.tenant_id", "=", tenantId)
        .where("users.user_id", "=", user_id)
        .selectAll("users")
        .select([
          "user_activity.last_login",
          "user_activity.last_ip",
          "user_activity.login_count",
        ])
        .executeTakeFirst(),
      db
        .selectFrom("users")
        .where("users.tenant_id", "=", tenantId)
        .where("users.linked_to", "=", user_id)
        .selectAll()
        .orderBy("created_at", "asc")
        .execute(),
    ]);

    if (!sqlUser) {
      return null;
    }

    const { tenant_id, ...rest } = sqlUser;

    const user: User = {
      ...rest,
      email: sqlUser.email || "",
      email_verified: sqlUser.email_verified === 1,
      phone_verified:
        sqlUser.phone_verified !== null
          ? sqlUser.phone_verified === 1
          : undefined,
      is_social: sqlUser.is_social === 1,
      last_login: sqlUser.last_login ?? undefined,
      last_ip: sqlUser.last_ip ?? undefined,
      login_count: sqlUser.login_count ?? 0,
      app_metadata: JSON.parse(sqlUser.app_metadata),
      user_metadata: JSON.parse(sqlUser.user_metadata),
      address: sqlUser.address ? JSON.parse(sqlUser.address) : undefined,
      identities: [
        userToIdentity(sqlUser, true),
        ...linkedUsers.map((u) => userToIdentity(u)),
      ],
    };

    return removeNullProperties(user);
  };
}
