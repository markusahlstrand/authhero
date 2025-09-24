import { Kysely } from "kysely";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { Database } from "../db";
import { User, UserInsert } from "@authhero/adapter-interfaces";

export function create(db: Kysely<Database>) {
  return async (tenantId: string, user: UserInsert): Promise<User> => {
    // Generate user_id if not provided
    const user_id = user.user_id || nanoid();

    const sqlUser = {
      ...user,
      user_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      login_count: 0,
      tenant_id: tenantId,
      email_verified: user.email_verified ? 1 : 0,
      is_social: user.is_social || false ? 1 : 0,
      app_metadata: JSON.stringify(user.app_metadata || {}),
      user_metadata: JSON.stringify(user.user_metadata || {}),
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

    // Return User object with required fields
    return {
      user_id,
      is_social: user.is_social || false,
      login_count: 0,
      created_at: sqlUser.created_at,
      updated_at: sqlUser.updated_at,
      email_verified: user.email_verified,
      provider: user.provider,
      connection: user.connection,
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
      app_metadata: user.app_metadata,
      user_metadata: user.user_metadata,
      verify_email: user.verify_email,
      last_ip: user.last_ip,
      last_login: user.last_login,
      // identities will be populated later if needed
    };
  };
}
