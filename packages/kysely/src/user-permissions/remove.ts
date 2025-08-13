import { Kysely } from "kysely";
import { Database } from "../db";

type UserPermissionRemove = {
  resource_server_identifier: string;
  permission_name: string;
};

export function remove(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    permissions: UserPermissionRemove[],
  ): Promise<boolean> => {
    if (permissions.length === 0) return true;

    try {
      for (const permission of permissions) {
        await db
          .deleteFrom("user_permissions")
          .where("tenant_id", "=", tenant_id)
          .where("user_id", "=", user_id)
          .where(
            "resource_server_identifier",
            "=",
            permission.resource_server_identifier,
          )
          .where("permission_name", "=", permission.permission_name)
          .execute();
      }
      return true;
    } catch (error) {
      console.error("Error removing user permissions:", error);
      return false;
    }
  };
}
