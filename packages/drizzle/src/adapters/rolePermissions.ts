import { eq, and } from "drizzle-orm";
import { rolePermissions, resourceServers } from "../schema/sqlite";
import type { DrizzleDb } from "./types";

export function createRolePermissionsAdapter(
  db: DrizzleDb,
) {
  return {
    async assign(
      tenant_id: string,
      role_id: string,
      permissions: Array<{
        resource_server_identifier: string;
        permission_name: string;
      }>,
    ): Promise<boolean> {
      for (const perm of permissions) {
        try {
          await db.insert(rolePermissions).values({
            tenant_id,
            role_id,
            resource_server_identifier: perm.resource_server_identifier,
            permission_name: perm.permission_name,
            created_at: new Date().toISOString(),
          });
        } catch (error: any) {
          // Ignore duplicate constraint errors (idempotent)
          if (
            error?.message?.includes("UNIQUE constraint") ||
            error?.message?.includes("SQLITE_CONSTRAINT_PRIMARYKEY")
          ) {
            continue;
          }
          throw error;
        }
      }

      return true;
    },

    async list(tenant_id: string, role_id: string, _params?: any) {
      const results = await db
        .select({
          resource_server_identifier:
            rolePermissions.resource_server_identifier,
          permission_name: rolePermissions.permission_name,
          created_at: rolePermissions.created_at,
        })
        .from(rolePermissions)
        .where(
          and(
            eq(rolePermissions.tenant_id, tenant_id),
            eq(rolePermissions.role_id, role_id),
          ),
        )
        .all();

      // Try to get resource server names
      const mapped = await Promise.all(
        results.map(async (row) => {
          const rs = await db
            .select({ name: resourceServers.name })
            .from(resourceServers)
            .where(
              and(
                eq(resourceServers.tenant_id, tenant_id),
                eq(
                  resourceServers.identifier,
                  row.resource_server_identifier,
                ),
              ),
            )
            .get();

          return {
            ...row,
            resource_server_name:
              rs?.name || row.resource_server_identifier,
          };
        }),
      );

      return mapped;
    },

    async remove(
      tenant_id: string,
      role_id: string,
      permissions: Array<{
        resource_server_identifier: string;
        permission_name: string;
      }>,
    ): Promise<boolean> {
      let deleted = false;
      for (const perm of permissions) {
        const results = await db
          .delete(rolePermissions)
          .where(
            and(
              eq(rolePermissions.tenant_id, tenant_id),
              eq(rolePermissions.role_id, role_id),
              eq(
                rolePermissions.resource_server_identifier,
                perm.resource_server_identifier,
              ),
              eq(rolePermissions.permission_name, perm.permission_name),
            ),
          )
          .returning();

        if (results.length > 0) deleted = true;
      }

      return deleted;
    },
  };
}
