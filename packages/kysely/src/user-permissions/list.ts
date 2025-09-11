import { Kysely } from "kysely";
import { Database } from "../db";
import {
  ListParams,
  UserPermissionWithDetails,
} from "@authhero/adapter-interfaces";

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    _params?: ListParams, // TODO: Implement pagination when needed
    organization_id?: string,
  ): Promise<UserPermissionWithDetails[]> => {
    let query = db
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
        "user_permissions.organization_id",
      ])
      .where("user_permissions.tenant_id", "=", tenant_id)
      .where("user_permissions.user_id", "=", user_id);

    // Add organization filter if provided
    if (organization_id !== undefined) {
      query = query.where(
        "user_permissions.organization_id",
        "=",
        organization_id,
      );
    }

    const results = await query.execute();

    return results.map((result) => ({
      resource_server_identifier: result.resource_server_identifier,
      permission_name: result.permission_name,
      description: null, // No description available from user_permissions directly
      resource_server_name:
        result.resource_server_name || result.resource_server_identifier, // Fallback to identifier if name is null
      user_id: result.user_id,
      created_at: result.created_at,
      organization_id:
        result.organization_id === "" ? undefined : result.organization_id,
    }));
  };
}
