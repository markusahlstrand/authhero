import { Kysely } from "kysely";
import { HTTPException } from "hono/http-exception";
import { Database } from "../db";
import {
  UserOrganization,
  UserOrganizationInsert,
} from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";

export function create(db: Kysely<Database>) {
  return async (
    tenantId: string,
    userOrganization: UserOrganizationInsert,
  ): Promise<UserOrganization> => {
    const sqlUserOrganization = {
      id: nanoid(),
      tenant_id: tenantId,
      user_id: userOrganization.user_id,
      organization_id: userOrganization.organization_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      await db
        .insertInto("user_organizations")
        .values(sqlUserOrganization)
        .execute();
    } catch (err: any) {
      if (
        err.code === "SQLITE_CONSTRAINT_UNIQUE" ||
        err.code === "ER_DUP_ENTRY"
      ) {
        throw new HTTPException(409, {
          message: "User is already a member of this organization",
        });
      }
      throw err;
    }

    return {
      ...sqlUserOrganization,
    };
  };
}
