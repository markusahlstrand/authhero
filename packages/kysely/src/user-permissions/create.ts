import { Kysely } from "kysely";
import { Database } from "../db";
import { UserPermissionInsert } from "@authhero/adapter-interfaces";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    permission: UserPermissionInsert,
    organization_id?: string,
  ): Promise<boolean> => {
    const now = new Date().toISOString();

    try {
      const assignment = {
        tenant_id,
        user_id,
        resource_server_identifier: permission.resource_server_identifier,
        permission_name: permission.permission_name,
        organization_id: organization_id || permission.organization_id || "",
        created_at: now,
      };

      await db.insertInto("user_permissions").values(assignment).execute();
      return true;
    } catch (error: any) {
      // Ignore duplicate primary key or unique constraint errors
      if (
        error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
        error.code === "SQLITE_CONSTRAINT_UNIQUE" ||
        error.code === "SQLITE_CONSTRAINT" ||
        (error.message && error.message.includes("UNIQUE constraint failed")) ||
        (error.message &&
          error.message.includes("PRIMARY KEY constraint failed"))
      ) {
        // Permission already exists, this is fine for idempotent operation
        return true;
      }
      console.error("Error creating user permission:", error);
      return false;
    }
  };
}
