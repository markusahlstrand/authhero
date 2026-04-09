import { eq, and, or, like, count as countFn, asc, desc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Organization, ListParams } from "@authhero/adapter-interfaces";
import { organizations } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import type { DrizzleDb } from "./types";

function generateOrganizationId(): string {
  const { customAlphabet } = require("nanoid");
  const generate = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 17);
  return `org_${generate()}`;
}

function sqlToOrganization(row: any): Organization {
  const { tenant_id: _, branding, metadata, enabled_connections, token_quota, ...rest } = row;
  return removeNullProperties({
    ...rest,
    branding: parseJsonIfString(branding, {}),
    metadata: parseJsonIfString(metadata, {}),
    enabled_connections: parseJsonIfString(enabled_connections, []),
    token_quota: parseJsonIfString(token_quota, {}),
  });
}

export function createOrganizationsAdapter(db: DrizzleDb) {
  return {
    async create(tenantId: string, params: any): Promise<Organization> {
      const now = new Date().toISOString();
      const id = params.id || generateOrganizationId();

      const values = {
        id,
        tenant_id: tenantId,
        name: params.name,
        display_name: params.display_name,
        branding: JSON.stringify(params.branding || {}),
        metadata: JSON.stringify(params.metadata || {}),
        enabled_connections: JSON.stringify(params.enabled_connections || []),
        token_quota: JSON.stringify(params.token_quota || {}),
        created_at: now,
        updated_at: now,
      };

      try {
        await db.insert(organizations).values(values);
      } catch (error: any) {
        if (
          error?.message?.includes("UNIQUE constraint failed") ||
          error?.message?.includes("AlreadyExists")
        ) {
          throw new HTTPException(409, {
            message: "Organization already exists",
          });
        }
        throw error;
      }

      return sqlToOrganization({ ...values, tenant_id: tenantId });
    },

    async get(tenantId: string, id: string): Promise<Organization | null> {
      // Try by ID first
      let result = await db
        .select()
        .from(organizations)
        .where(
          and(eq(organizations.tenant_id, tenantId), eq(organizations.id, id)),
        )
        .get();

      // Try by name if not found
      if (!result) {
        result = await db
          .select()
          .from(organizations)
          .where(
            and(
              eq(organizations.tenant_id, tenantId),
              eq(organizations.name, id),
            ),
          )
          .get();
      }

      if (!result) return null;
      return sqlToOrganization(result);
    },

    async update(
      tenantId: string,
      id: string,
      params: Partial<Organization>,
    ): Promise<boolean> {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (params.name !== undefined) updateData.name = params.name;
      if (params.display_name !== undefined)
        updateData.display_name = params.display_name;
      if (params.branding !== undefined)
        updateData.branding = JSON.stringify(params.branding);
      if (params.metadata !== undefined)
        updateData.metadata = JSON.stringify(params.metadata);
      if (params.enabled_connections !== undefined)
        updateData.enabled_connections = JSON.stringify(
          params.enabled_connections,
        );
      if (params.token_quota !== undefined)
        updateData.token_quota = JSON.stringify(params.token_quota);

      const results = await db
        .update(organizations)
        .set(updateData)
        .where(
          and(eq(organizations.tenant_id, tenantId), eq(organizations.id, id)),
        )
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

      let query = db
        .select()
        .from(organizations)
        .where(eq(organizations.tenant_id, tenantId))
        .$dynamic();

      if (q) {
        // Simple name/display_name filter
        query = query.where(
          or(
            like(organizations.name, `%${q}%`),
            like(organizations.display_name, `%${q}%`),
          ),
        );
      }

      if (sort?.sort_by) {
        const col = (organizations as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map(sqlToOrganization);

      if (!include_totals) {
        return { organizations: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(organizations)
        .where(eq(organizations.tenant_id, tenantId));

      return {
        organizations: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      const results = await db
        .delete(organizations)
        .where(
          and(eq(organizations.tenant_id, tenantId), eq(organizations.id, id)),
        )
        .returning();

      return results.length > 0;
    },
  };
}
