import { Kysely } from "kysely";
import { Database } from "../db";
import { RolePermissionInsert } from "@authhero/adapter-interfaces";

export function assign(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    role_id: string,
    permissions: RolePermissionInsert[],
  ): Promise<boolean> => {
    if (permissions.length === 0) return true;

    const now = new Date().toISOString();

    try {
      // Insert permissions one by one to handle duplicates gracefully
      for (const permission of permissions) {
        // Validate that the role_id in the permission matches the parameter
        if (permission.role_id !== role_id) {
          throw new Error(
            `Permission role_id ${permission.role_id} does not match expected role_id ${role_id}`,
          );
        }

        const assignment = {
          tenant_id,
          role_id: permission.role_id,
          resource_server_identifier: permission.resource_server_identifier,
          permission_name: permission.permission_name,
          created_at: now,
        };

        try {
          await db.insertInto("role_permissions").values(assignment).execute();
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
      console.error("Error assigning role permissions:", error);
      return false;
    }
  };
}
