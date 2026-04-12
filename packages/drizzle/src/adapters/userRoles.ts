import { eq, and } from "drizzle-orm";
import { userRoles, roles } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import type { DrizzleDb } from "./types";

export function createUserRolesAdapter(db: DrizzleDb) {
  return {
    async create(
      tenant_id: string,
      user_id: string,
      role_id: string,
      organization_id?: string,
    ): Promise<boolean> {
      try {
        await db.insert(userRoles).values({
          tenant_id,
          user_id,
          role_id,
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
        eq(userRoles.tenant_id, tenant_id),
        eq(userRoles.user_id, user_id),
      ];

      if (organization_id) {
        conditions.push(eq(userRoles.organization_id, organization_id));
      }

      const results = await db
        .select({
          role_id: userRoles.role_id,
        })
        .from(userRoles)
        .where(and(...conditions))
        .all();

      if (results.length === 0) return [];

      // Fetch role details
      const roleResults = await Promise.all(
        results.map(async (row) => {
          const role = await db
            .select()
            .from(roles)
            .where(
              and(eq(roles.tenant_id, tenant_id), eq(roles.id, row.role_id)),
            )
            .get();

          if (!role) return null;

          const { tenant_id: _, is_system, metadata, ...rest } = role;
          return removeNullProperties({
            ...rest,
            is_system: is_system ? true : undefined,
            metadata: parseJsonIfString(metadata),
          });
        }),
      );

      return roleResults.filter(Boolean) as any[];
    },

    async remove(
      tenant_id: string,
      user_id: string,
      role_id: string,
      organization_id?: string,
    ): Promise<boolean> {
      const results = await db
        .delete(userRoles)
        .where(
          and(
            eq(userRoles.tenant_id, tenant_id),
            eq(userRoles.user_id, user_id),
            eq(userRoles.role_id, role_id),
            eq(userRoles.organization_id, organization_id || ""),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
