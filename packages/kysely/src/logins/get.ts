import { Kysely } from "kysely";
import { Login, loginSchema } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { unflattenObject } from "../flattten";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, login_id: string): Promise<Login | null> => {
    const now = new Date().toISOString();

    const login = await db
      .selectFrom("logins")
      .where("logins.tenant_id", "=", tenant_id)
      .where("logins.expires_at", ">", now)
      .where("logins.id", "=", login_id)
      .selectAll()
      .executeTakeFirst();

    if (!login) return null;

    return loginSchema.parse(unflattenObject(login, ["authParams"]));
  };
}