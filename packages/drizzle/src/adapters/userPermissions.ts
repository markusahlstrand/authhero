import { eq, and } from "drizzle-orm";
import { userPermissions, resourceServers } from "../schema/sqlite";
import type { DrizzleDb } from "./types";

export function createUserPermissionsAdapter(db: DrizzleDb) {
  return {
    async create(
      tenant_id: string,
      user_id: string,
      permission: {
        resource_server_identifier: string;
        permission_name: string;
      },
      organization_id?: string,
    ): Promise<boolean> {
      try {
        await db.insert(userPermissions).values({
          tenant_id,
          user_id,
          resource_server_identifier: permission.resource_server_identifier,
          permission_name: permission.permission_name,
          organization_id: organization_id || "",
          created_at: new Date().toISOString(),
        });
      } catch (error: any) {
        // Ignore duplicate constraint errors (idempotent)
        if (
          error?.message?.includes("UNIQUE constraint") ||
          error?.message?.includes("SQLITE_CONSTRAINT_PRIMARYKEY")
        ) {
          return true;
        }
        throw error;
      }

      return true;
    },

    async list(
      tenant_id: string,
      user_id: string,
      _params?: any,
      organization_id?: string,
    ) {
      let conditions = [
        eq(userPermissions.tenant_id, tenant_id),
        eq(userPermissions.user_id, user_id),
      ];

      if (organization_id) {
        conditions.push(eq(userPermissions.organization_id, organization_id));
      }

      const results = await db
        .select()
        .from(userPermissions)
        .where(and(...conditions))
        .all();

      const mapped = await Promise.all(
        results.map(async (row) => {
          const rs = await db
            .select({ name: resourceServers.name })
            .from(resourceServers)
            .where(
              and(
                eq(resourceServers.tenant_id, tenant_id),
                eq(resourceServers.identifier, row.resource_server_identifier),
              ),
            )
            .get();

          return {
            resource_server_identifier: row.resource_server_identifier,
            permission_name: row.permission_name,
            resource_server_name: rs?.name || row.resource_server_identifier,
            organization_id:
              row.organization_id === "" ? undefined : row.organization_id,
          };
        }),
      );

      return mapped;
    },

    async remove(
      tenant_id: string,
      user_id: string,
      permission: {
        resource_server_identifier: string;
        permission_name: string;
      },
      organization_id?: string,
    ): Promise<boolean> {
      const results = await db
        .delete(userPermissions)
        .where(
          and(
            eq(userPermissions.tenant_id, tenant_id),
            eq(userPermissions.user_id, user_id),
            eq(
              userPermissions.resource_server_identifier,
              permission.resource_server_identifier,
            ),
            eq(userPermissions.permission_name, permission.permission_name),
            eq(userPermissions.organization_id, organization_id || ""),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
