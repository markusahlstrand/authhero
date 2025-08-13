import { Kysely } from "kysely";
import { Database } from "../db";

type UserPermissionInsert = {
  resource_server_identifier: string;
  permission_name: string;
};

export function assign(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    permissions: UserPermissionInsert[],
  ): Promise<boolean> => {
    if (permissions.length === 0) return true;

    const now = new Date().toISOString();

    try {
      // Insert permissions one by one to handle duplicates gracefully
      for (const permission of permissions) {
        const assignment = {
          tenant_id,
          user_id,
          resource_server_identifier: permission.resource_server_identifier,
          permission_name: permission.permission_name,
          created_at: now,
        };

        try {
          await db.insertInto("user_permissions").values(assignment).execute();
        } catch (error: any) {
          // Ignore duplicate key constraint errors (SQLITE_CONSTRAINT_PRIMARYKEY)
          if (
            error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
            error.code === "SQLITE_CONSTRAINT_UNIQUE"
          ) {
            // Permission already exists, this is fine for idempotent operation
            continue;
          }
          throw error; // Re-throw other errors
        }
      }
      return true;
    } catch (error) {
      console.error("Error assigning user permissions:", error);
      return false;
    }
  };
}
