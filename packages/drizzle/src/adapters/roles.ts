import { eq, and, count as countFn, asc, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Role, ListParams } from "@authhero/adapter-interfaces";
import { roles } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import { buildLuceneFilter } from "../helpers/filter";
import type { DrizzleDb } from "./types";

function sqlToRole(row: any): Role {
  const { tenant_id: _, is_system, metadata, ...rest } = row;
  return removeNullProperties({
    ...rest,
    is_system: is_system ? true : undefined,
    metadata: parseJsonIfString(metadata),
  });
}

export function createRolesAdapter(db: DrizzleDb) {
  return {
    async create(tenantId: string, params: any): Promise<Role> {
      const now = new Date().toISOString();
      const id = params.id || nanoid();

      const values = {
        id,
        tenant_id: tenantId,
        name: params.name,
        description: params.description,
        is_system: params.is_system ? 1 : 0,
        metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
        created_at: now,
        updated_at: now,
      };

      await db.insert(roles).values(values);

      return sqlToRole({ ...values, tenant_id: tenantId });
    },

    async get(tenantId: string, roleId: string): Promise<Role | null> {
      const result = await db
        .select()
        .from(roles)
        .where(and(eq(roles.tenant_id, tenantId), eq(roles.id, roleId)))
        .get();

      if (!result) return null;
      return sqlToRole(result);
    },

    async update(
      tenantId: string,
      roleId: string,
      params: Partial<Role>,
    ): Promise<boolean> {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (params.name !== undefined) updateData.name = params.name;
      if (params.description !== undefined)
        updateData.description = params.description;
      if (params.is_system !== undefined)
        updateData.is_system = params.is_system ? 1 : 0;
      if (params.metadata !== undefined)
        updateData.metadata = JSON.stringify(params.metadata);

      const results = await db
        .update(roles)
        .set(updateData)
        .where(and(eq(roles.tenant_id, tenantId), eq(roles.id, roleId)))
        .returning();

      return results.length > 0;
    },

    async list(tenantId: string, params?: ListParams) {
      const {
        page = 0,
        per_page = 50,
        include_totals = false,
        sort,
        q,
      } = params || {};

      const luceneFilter = q
        ? buildLuceneFilter(roles, q, ["name"])
        : undefined;

      const whereClause = luceneFilter
        ? and(eq(roles.tenant_id, tenantId), luceneFilter)
        : eq(roles.tenant_id, tenantId);

      let query = db.select().from(roles).where(whereClause).$dynamic();

      if (sort?.sort_by) {
        const col = (roles as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map(sqlToRole);

      if (!include_totals) {
        return { roles: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(roles)
        .where(whereClause);

      return {
        roles: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenantId: string, roleId: string): Promise<boolean> {
      const results = await db
        .delete(roles)
        .where(and(eq(roles.tenant_id, tenantId), eq(roles.id, roleId)))
        .returning();

      return results.length > 0;
    },
  };
}
