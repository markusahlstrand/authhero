import { eq, and, or, inArray } from "drizzle-orm";
import { rolePermissions, resourceServers } from "../schema/sqlite";
import type { DrizzleDb } from "./types";

export function createRolePermissionsAdapter(db: DrizzleDb) {
  return {
    async assign(
      tenant_id: string,
      role_id: string,
      permissions: Array<{
        resource_server_identifier: string;
        permission_name: string;
      }>,
    ): Promise<boolean> {
      const now = new Date().toISOString();
      // Chunked: D1 caps bound parameters at 100 per statement (5 columns →
      // max 20 rows). A single multi-VALUES insert of e.g. the admin role's
      // 239 permissions binds ~1200 parameters and fails on D1, while passing
      // on better-sqlite3 — chunking keeps one behavior on both.
      const CHUNK = 18;
      const rows = permissions.map((perm) => ({
        tenant_id,
        role_id,
        resource_server_identifier: perm.resource_server_identifier,
        permission_name: perm.permission_name,
        created_at: now,
      }));
      for (let i = 0; i < rows.length; i += CHUNK) {
        await db
          .insert(rolePermissions)
          .values(rows.slice(i, i + CHUNK))
          .onConflictDoNothing();
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

      // Batch-fetch resource server names to avoid N+1 queries
      const uniqueIdentifiers = [
        ...new Set(results.map((r) => r.resource_server_identifier)),
      ];

      const nameMap = new Map<string, string>();
      if (uniqueIdentifiers.length > 0) {
        const rsRows = await db
          .select({
            identifier: resourceServers.identifier,
            name: resourceServers.name,
          })
          .from(resourceServers)
          .where(
            and(
              eq(resourceServers.tenant_id, tenant_id),
              inArray(resourceServers.identifier, uniqueIdentifiers),
            ),
          )
          .all();

        for (const rs of rsRows) {
          nameMap.set(rs.identifier, rs.name);
        }
      }

      return results.map((row) => ({
        ...row,
        resource_server_name:
          nameMap.get(row.resource_server_identifier) ||
          row.resource_server_identifier,
      }));
    },

    async remove(
      tenant_id: string,
      role_id: string,
      permissions: Array<{
        resource_server_identifier: string;
        permission_name: string;
      }>,
    ): Promise<boolean> {
      const permsPredicates = permissions.map((perm) =>
        and(
          eq(
            rolePermissions.resource_server_identifier,
            perm.resource_server_identifier,
          ),
          eq(rolePermissions.permission_name, perm.permission_name),
        ),
      );

      const results = await db
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.tenant_id, tenant_id),
            eq(rolePermissions.role_id, role_id),
            or(...permsPredicates),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
