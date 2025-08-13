import { Kysely } from "kysely";
import { Database } from "../db";
import { ListParams } from "@authhero/adapter-interfaces";

type UserPermissionWithDetails = {
  resource_server_identifier: string;
  permission_name: string;
  description?: string | null;
  resource_server_name: string;
  user_id: string;
  created_at?: string;
};

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    _params?: ListParams, // TODO: Implement pagination when needed
  ): Promise<UserPermissionWithDetails[]> => {
    const results = await db
      .selectFrom("user_permissions")
      .leftJoin("resource_servers", (join) =>
        join
          .onRef(
            "user_permissions.tenant_id",
            "=",
            "resource_servers.tenant_id",
          )
          .onRef(
            "user_permissions.resource_server_identifier",
            "=",
            "resource_servers.id",
          ),
      )
      .select([
        "user_permissions.resource_server_identifier",
        "user_permissions.permission_name",
        "resource_servers.name as resource_server_name",
        "user_permissions.user_id",
        "user_permissions.created_at",
      ])
      .where("user_permissions.tenant_id", "=", tenant_id)
      .where("user_permissions.user_id", "=", user_id)
      .execute();

    return results.map((result) => ({
      resource_server_identifier: result.resource_server_identifier,
      permission_name: result.permission_name,
      description: null, // No description available from user_permissions directly
      resource_server_name:
        result.resource_server_name || result.resource_server_identifier, // Fallback to identifier if name is null
      user_id: result.user_id,
      created_at: result.created_at,
    }));
  };
}
