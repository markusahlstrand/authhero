import { Kysely } from "kysely";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { Database, databaseOptions } from "../db";
import { User, UserInsert } from "@authhero/adapter-interfaces";

export function create(db: Kysely<Database>, databaseOptions: databaseOptions) {
  return async (tenantId: string, user: UserInsert): Promise<User> => {
    const { identities, phone_verified, password, ...rest } = user as User &
      Pick<UserInsert, "password">;

    const sqlUser = {
      ...rest,
      login_count: rest.login_count ?? 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tenant_id: tenantId,
      email_verified: user.email_verified ? 1 : 0,
      phone_verified:
        phone_verified !== undefined ? (phone_verified ? 1 : 0) : null,
      is_social: user.is_social ? 1 : 0,
      app_metadata: JSON.stringify(user.app_metadata),
      user_metadata: JSON.stringify(user.user_metadata),
      address: user.address ? JSON.stringify(user.address) : null,
    };

    try {
      if (databaseOptions.useTransactions === false) {
        await db.insertInto("users").values(sqlUser).execute();

        // If password is provided, create it in the same transaction
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
          await db.insertInto("passwords").values(passwordRecord).execute();
        }
      } else {
        // Use a transaction to ensure atomicity of user and password creation
        await db.transaction().execute(async (trx) => {
          await trx.insertInto("users").values(sqlUser).execute();

          // If password is provided, create it in the same transaction
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
        });
      }
    } catch (err: any) {
      if (
        err.code === "SQLITE_CONSTRAINT_UNIQUE" ||
        err.message.includes("AlreadyExists")
      ) {
        throw new HTTPException(409, { message: "User already exists" });
      }
      throw new HTTPException(500, { message: `${err.code}, ${err.message}` });
    }

    return {
      ...sqlUser,
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
