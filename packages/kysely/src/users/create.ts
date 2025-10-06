import { Kysely } from "kysely";
import { HTTPException } from "hono/http-exception";
import { Database } from "../db";
import { User } from "@authhero/adapter-interfaces";

export function create(db: Kysely<Database>) {
  return async (tenantId: string, user: User): Promise<User> => {
    const { identities, ...rest } = user;

    const sqlUser = {
      ...rest,
      login_count: rest.login_count ?? 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tenant_id: tenantId,
      email_verified: user.email_verified ? 1 : 0,
      is_social: user.is_social ? 1 : 0,
      app_metadata: JSON.stringify(user.app_metadata),
      user_metadata: JSON.stringify(user.user_metadata),
    };

    try {
      await db.insertInto("users").values(sqlUser).execute();
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
      is_social: sqlUser.is_social === 1,
    };
  };
}
