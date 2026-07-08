import { Kysely } from "kysely";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { Database } from "../db";
import { User, UserInsert, CreateOptions } from "@authhero/adapter-interfaces";

export function create(db: Kysely<Database>) {
  return async (
    tenantId: string,
    user: UserInsert,
    options?: CreateOptions,
  ): Promise<User> => {
    const importMetadata = options?.importMetadata;
    const {
      identities,
      phone_verified,
      password,
      // Activity counters are stored in user_activity, not on the users row
      // (issue #1003) — split them off and write them separately below.
      last_login,
      last_ip,
      login_count,
      ...rest
    } = user as User & Pick<UserInsert, "password">;

    const now = new Date().toISOString();
    const sqlUser = {
      ...rest,
      created_at: importMetadata?.created_at ?? rest.created_at ?? now,
      updated_at: importMetadata?.updated_at ?? rest.updated_at ?? now,
      user_id: importMetadata?.id ?? rest.user_id,
      tenant_id: tenantId,
      email_verified: user.email_verified ? 1 : 0,
      phone_verified:
        phone_verified !== undefined ? (phone_verified ? 1 : 0) : null,
      is_social: user.is_social ? 1 : 0,
      app_metadata: JSON.stringify(user.app_metadata),
      user_metadata: JSON.stringify(user.user_metadata),
      address: user.address ? JSON.stringify(user.address) : null,
    };

    const execute = async (trx: Kysely<Database>) => {
      await trx.insertInto("users").values(sqlUser).execute();

      // Callers that record a login at creation time (e.g. lazy Auth0
      // migration, social sign-up) pass activity fields — persist them in
      // the same transaction so the user never exists without them.
      if (
        sqlUser.user_id &&
        (last_login !== undefined ||
          last_ip !== undefined ||
          login_count !== undefined)
      ) {
        await trx
          .insertInto("user_activity")
          .values({
            tenant_id: tenantId,
            user_id: sqlUser.user_id,
            last_login: last_login ?? null,
            last_ip: last_ip ?? null,
            login_count: login_count ?? 0,
          })
          .execute();
      }

      if (password && sqlUser.user_id) {
        const passwordRecord = {
          id: nanoid(),
          user_id: sqlUser.user_id,
          password: password.hash,
          algorithm: password.algorithm as "bcrypt" | "argon2id",
          is_current: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tenant_id: tenantId,
        };
        await trx.insertInto("passwords").values(passwordRecord).execute();
      }
    };

    try {
      if (db.isTransaction) {
        await execute(db);
      } else {
        await db.transaction().execute(execute);
      }
    } catch (err: any) {
      if (
        err.code === "SQLITE_CONSTRAINT_UNIQUE" ||
        err.code === "ER_DUP_ENTRY" ||
        err.message.includes("AlreadyExists")
      ) {
        throw new HTTPException(409, { message: "User already exists" });
      }
      throw new HTTPException(500, { message: `${err.code}, ${err.message}` });
    }

    return {
      ...sqlUser,
      last_login,
      last_ip,
      login_count: login_count ?? 0,
      // TODO: check if this is correct. Should it be optional?
      email: sqlUser.email || "",
      email_verified: sqlUser.email_verified === 1,
      phone_verified:
        sqlUser.phone_verified !== null
          ? sqlUser.phone_verified === 1
          : undefined,
      is_social: sqlUser.is_social === 1,
      address: user.address, // Return original address object, not serialized string
    };
  };
}
