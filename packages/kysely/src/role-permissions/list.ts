import { Kysely } from "kysely";
import { Database } from "../db";
import { ListParams } from "@authhero/adapter-interfaces";

type RolePermissionWithDetails = {
  role_id: string;
  resource_server_identifier: string;
  resource_server_name: string; // Required, not nullable
  permission_name: string;
  description: string | null | undefined;
  created_at: string;
};

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    role_id: string,
    params: ListParams = {},
  ): Promise<RolePermissionWithDetails[]> => {
    const { page = 0, per_page = 50, include_totals = false } = params;

    let query = db
      .selectFrom("role_permissions")
      .leftJoin("resource_servers", (join) =>
        join
          .onRef(
            "role_permissions.tenant_id",
            "=",
            "resource_servers.tenant_id",
          )
          .onRef(
            "role_permissions.resource_server_identifier",
            "=",
            "resource_servers.id",
          ),
      )
      .select([
        "role_permissions.role_id",
        "role_permissions.resource_server_identifier",
        "role_permissions.permission_name",
        "role_permissions.created_at",
        "resource_servers.name as resource_server_name",
      ])
      .where("role_permissions.tenant_id", "=", tenant_id)
      .where("role_permissions.role_id", "=", role_id);

    const filteredQuery = query.offset(page * per_page).limit(per_page);
    const rows = await filteredQuery.execute();

    const rolePermissions = rows.map((row) => ({
      role_id: row.role_id,
      resource_server_identifier: row.resource_server_identifier,
      resource_server_name:
        row.resource_server_name || row.resource_server_identifier, // Fallback to identifier if name is null
      permission_name: row.permission_name,
      description: null, // No description available from role_permissions directly
      created_at: row.created_at,
    }));

    // Only execute count query if include_totals is true
    // This optimization saves an unnecessary query when totals aren't needed
    if (include_totals) {
      await query
        .select((eb) => eb.fn.countAll().as("count"))
        .executeTakeFirstOrThrow();

      // Note: When include_totals is true, we could return pagination metadata
      // but the current interface expects just an array, so we're just optimizing
      // the query execution for now
    }

    return rolePermissions;
  };
}
