import { eq, and, or, inArray } from "drizzle-orm";
import { rolePermissions, resourceServers } from "../schema/sqlite";
import type {
  ListParams,
  ListRolePermissionsCheckpointResponse,
} from "@authhero/adapter-interfaces";
import {
  keysetCondition,
  keysetOrderBy,
  keysetTake,
  sliceWithNext,
} from "../helpers/paginate";
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
      if (permissions.length === 0) return true;

      const now = new Date().toISOString();
      await db
        .insert(rolePermissions)
        .values(
          permissions.map((perm) => ({
            tenant_id,
            role_id,
            resource_server_identifier: perm.resource_server_identifier,
            permission_name: perm.permission_name,
            created_at: now,
          })),
        )
        .onConflictDoNothing();

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

      return withResourceServerNames(db, tenant_id, results);
    },

    // Checkpoint (from/take) pagination. The composite key
    // (resource_server_identifier, permission_name) is unique per role, so it
    // serves as sort column + tiebreaker without a surrogate id.
    async listCheckpoint(
      tenant_id: string,
      role_id: string,
      params: ListParams = {},
    ): Promise<ListRolePermissionsCheckpointResponse> {
      const cols = {
        sortColumn: rolePermissions.resource_server_identifier,
        idColumn: rolePermissions.permission_name,
        sortOrder: "asc" as const,
      };
      const take = keysetTake(params);
      const rows = await db
        .select({
          role_id: rolePermissions.role_id,
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
            keysetCondition(params, cols),
          ),
        )
        .orderBy(...keysetOrderBy(cols))
        .limit(take + 1)
        .all();
      const { rows: pageRows, next } = sliceWithNext(
        rows,
        take,
        "resource_server_identifier",
        "permission_name",
      );
      return {
        permissions: await withResourceServerNames(db, tenant_id, pageRows),
        next,
      };
    },

    async remove(
      tenant_id: string,
      role_id: string,
      permissions: Array<{
        resource_server_identifier: string;
        permission_name: string;
      }>,
    ): Promise<boolean> {
      // `or()` with no predicates is `undefined`, which would collapse the
      // where clause to tenant+role and wipe every permission on the role.
      if (permissions.length === 0) return true;

      const permsPredicates = permissions.map((perm) =>
        and(
          eq(
            rolePermissions.resource_server_identifier,
            perm.resource_server_identifier,
          ),
          eq(rolePermissions.permission_name, perm.permission_name),
        ),
      );

      await db
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.tenant_id, tenant_id),
            eq(rolePermissions.role_id, role_id),
            or(...permsPredicates),
          ),
        )
        .returning();

      // Removing an already-absent permission is a no-op, not a failure — the
      // caller turns `false` into a 500.
      return true;
    },
  };
}

// Batch-fetch resource server names to avoid N+1 queries
async function withResourceServerNames<
  Row extends { resource_server_identifier: string },
>(db: DrizzleDb, tenant_id: string, results: Row[]) {
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
}
