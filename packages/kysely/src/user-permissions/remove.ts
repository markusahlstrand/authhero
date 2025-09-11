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
    permission: UserPermissionRemove,
    organization_id?: string,
  ): Promise<boolean> => {
    try {
      let query = db
        .deleteFrom("user_permissions")
        .where("tenant_id", "=", tenant_id)
        .where("user_id", "=", user_id)
        .where(
          "resource_server_identifier",
          "=",
          permission.resource_server_identifier,
        )
        .where("permission_name", "=", permission.permission_name);

      // Add organization filter if provided
      if (organization_id !== undefined) {
        query = query.where("organization_id", "=", organization_id);
      } else {
        // If no organization_id provided, only remove permissions without organization context
        query = query.where("organization_id", "=", "");
      }

      await query.execute();
      return true;
    } catch (error) {
      console.error("Error removing user permission:", error);
      return false;
    }
  };
}
