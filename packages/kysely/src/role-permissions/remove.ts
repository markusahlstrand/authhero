import { Kysely } from "kysely";
import { Database } from "../db";
import { RolePermissionInsert } from "@authhero/adapter-interfaces";

export function remove(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    role_id: string,
    permissions: Pick<
      RolePermissionInsert,
      "resource_server_identifier" | "permission_name"
    >[],
  ): Promise<boolean> => {
    if (permissions.length === 0) return true;

    try {
      // For simplicity, delete each permission one by one
      await Promise.all(
        permissions.map((perm) =>
          db
            .deleteFrom("role_permissions")
            .where("tenant_id", "=", tenant_id)
            .where("role_id", "=", role_id)
            .where(
              "resource_server_identifier",
              "=",
              perm.resource_server_identifier,
            )
            .where("permission_name", "=", perm.permission_name)
            .executeTakeFirst(),
        ),
      );

      // Removing an already-absent permission is a no-op, not a failure — the
      // caller turns `false` into a 500.
      return true;
    } catch (error) {
      console.error("Error removing role permissions:", error);
      return false;
    }
  };
}
