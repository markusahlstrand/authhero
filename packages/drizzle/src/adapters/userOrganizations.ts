import { eq, and, count as countFn } from "drizzle-orm";
import { nanoid } from "nanoid";
import { HTTPException } from "hono/http-exception";
import type { UserOrganization, ListParams } from "@authhero/adapter-interfaces";
import { userOrganizations, organizations } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import { buildLuceneFilter } from "../helpers/filter";
import type { DrizzleDb } from "./types";

export function createUserOrganizationsAdapter(
  db: DrizzleDb,
) {
  return {
    async create(
      tenantId: string,
      params: any,
    ): Promise<UserOrganization> {
      const now = new Date().toISOString();
      const id = params.id || nanoid();

      const values = {
        id,
        tenant_id: tenantId,
        user_id: params.user_id,
        organization_id: params.organization_id,
        created_at: now,
        updated_at: now,
      };

      try {
        await db.insert(userOrganizations).values(values);
      } catch (error: any) {
        if (
          error?.message?.includes("UNIQUE constraint") ||
          error?.message?.includes("duplicate key")
        ) {
          throw new HTTPException(409, {
            message: "User organization already exists",
          });
        }
        throw error;
      }

      const { tenant_id: _, ...rest } = values;
      return rest;
    },

    async get(
      tenantId: string,
      id: string,
    ): Promise<UserOrganization | null> {
      const result = await db
        .select()
        .from(userOrganizations)
        .where(
          and(
            eq(userOrganizations.tenant_id, tenantId),
            eq(userOrganizations.id, id),
          ),
        )
        .get();

      if (!result) return null;

      const { tenant_id: _, ...rest } = result;
      return rest;
    },

    async update(
      tenantId: string,
      id: string,
      params: Partial<UserOrganization>,
    ): Promise<boolean> {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (params.user_id !== undefined) updateData.user_id = params.user_id;
      if (params.organization_id !== undefined)
        updateData.organization_id = params.organization_id;

      const results = await db
        .update(userOrganizations)
        .set(updateData)
        .where(
          and(
            eq(userOrganizations.tenant_id, tenantId),
            eq(userOrganizations.id, id),
          ),
        )
        .returning();

      return results.length > 0;
    },

    async list(tenantId: string, params?: ListParams) {
      const { page = 0, per_page = 50, include_totals = false, q } =
        params || {};

      const tenantFilter = eq(userOrganizations.tenant_id, tenantId);

      let whereCondition = tenantFilter;
      if (q) {
        const filter = buildLuceneFilter(userOrganizations, q, [
          "user_id",
          "organization_id",
        ]);
        if (filter) whereCondition = and(tenantFilter, filter)!;
      }

      const results = await db
        .select()
        .from(userOrganizations)
        .where(whereCondition)
        .offset(page * per_page)
        .limit(per_page);
      const mapped = results.map((row) => {
        const { tenant_id: _, ...rest } = row;
        return rest;
      });

      if (!include_totals) {
        return { userOrganizations: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(userOrganizations)
        .where(whereCondition);

      return {
        userOrganizations: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async listUserOrganizations(
      tenantId: string,
      userId: string,
      params?: ListParams,
    ) {
      const { page = 0, per_page = 50, include_totals = false } =
        params || {};

      const userOrgs = await db
        .select()
        .from(userOrganizations)
        .where(
          and(
            eq(userOrganizations.tenant_id, tenantId),
            eq(userOrganizations.user_id, userId),
          ),
        )
        .offset(page * per_page)
        .limit(per_page)
        .all();

      // Fetch organization details for each
      const orgsWithDetails = await Promise.all(
        userOrgs.map(async (uo) => {
          const org = await db
            .select()
            .from(organizations)
            .where(
              and(
                eq(organizations.tenant_id, tenantId),
                eq(organizations.id, uo.organization_id),
              ),
            )
            .get();

          if (!org) return null;

          const { tenant_id: _, branding, metadata, enabled_connections, token_quota, ...rest } = org;
          return removeNullProperties({
            ...rest,
            branding: parseJsonIfString(branding, {}),
            metadata: parseJsonIfString(metadata, {}),
            enabled_connections: parseJsonIfString(enabled_connections, []),
            token_quota: parseJsonIfString(token_quota, {}),
          });
        }),
      );

      const filtered = orgsWithDetails.filter(Boolean);

      if (!include_totals) {
        return { organizations: filtered };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(userOrganizations)
        .where(
          and(
            eq(userOrganizations.tenant_id, tenantId),
            eq(userOrganizations.user_id, userId),
          ),
        );

      return {
        organizations: filtered,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      const results = await db
        .delete(userOrganizations)
        .where(
          and(
            eq(userOrganizations.tenant_id, tenantId),
            eq(userOrganizations.id, id),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
