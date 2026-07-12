import { eq, and, asc, sql } from "drizzle-orm";
import type {
  ListParams,
  ListRoleUsersResponse,
} from "@authhero/adapter-interfaces";
import { userRoles, roles } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import {
  isKeysetRequest,
  keysetTake,
  keysetOrderBy,
  keysetCondition,
  sliceWithNext,
} from "../helpers/paginate";
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

    async listUsers(
      tenant_id: string,
      role_id: string,
      params?: ListParams,
    ): Promise<ListRoleUsersResponse> {
      // A user can hold the same role under several organization scopes; the
      // endpoint lists users, so collapse assignments to distinct user_ids.
      // user_roles has no surrogate id, so the (unique-after-distinct)
      // user_id doubles as both sort column and keyset tiebreaker.
      const roleFilter = and(
        eq(userRoles.tenant_id, tenant_id),
        eq(userRoles.role_id, role_id),
      );

      if (isKeysetRequest(params)) {
        const cols = {
          sortColumn: userRoles.user_id,
          idColumn: userRoles.user_id,
          sortOrder: "asc" as const,
        };
        const keyset = keysetCondition(params, cols);
        const take = keysetTake(params);
        const rows = await db
          .selectDistinct({ user_id: userRoles.user_id })
          .from(userRoles)
          .where(keyset ? and(roleFilter, keyset) : roleFilter)
          .orderBy(...keysetOrderBy(cols))
          .limit(take + 1)
          .all();
        const { rows: pageRows, next } = sliceWithNext(
          rows,
          take,
          "user_id",
          "user_id",
        );
        return {
          userIds: pageRows.map((row) => row.user_id),
          start: 0,
          limit: take,
          length: pageRows.length,
          next,
        };
      }

      const page = params?.page || 0;
      const per_page = params?.per_page || 50;
      const offset = page * per_page;

      const rows = await db
        .selectDistinct({ user_id: userRoles.user_id })
        .from(userRoles)
        .where(roleFilter)
        .orderBy(asc(userRoles.user_id))
        .limit(per_page)
        .offset(offset)
        .all();

      const total = await db
        .select({
          count: sql<number>`count(distinct ${userRoles.user_id})`,
        })
        .from(userRoles)
        .where(roleFilter)
        .get();

      return {
        userIds: rows.map((row) => row.user_id),
        start: offset,
        limit: per_page,
        length: Number(total?.count ?? 0),
      };
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
