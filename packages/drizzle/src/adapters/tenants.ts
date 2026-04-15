import { eq, count as countFn, asc, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { HTTPException } from "hono/http-exception";
import type {
  Tenant,
  CreateTenantParams,
  ListParams,
} from "@authhero/adapter-interfaces";
import { tenants } from "../schema/sqlite";
import {
  removeNullProperties,
  stringifyProperties,
  removeUndefinedAndNull,
  parseJsonIfString,
} from "../helpers/transform";
import { buildLuceneFilter } from "../helpers/filter";
import type { DrizzleDb } from "./types";

const JSON_FIELDS = [
  "session_cookie",
  "enabled_locales",
  "error_page",
  "flags",
  "sandbox_versions_available",
  "change_password",
  "guardian_mfa_page",
  "sessions",
  "oidc_logout",
  "device_flow",
  "default_token_quota",
  "allowed_logout_urls",
  "acr_values_supported",
  "mtls",
  "mfa",
] as const;

const BOOLEAN_FIELDS = [
  "allow_organization_name_in_authentication_api",
  "customize_mfa_in_postlogin_action",
  "pushed_authorization_requests_supported",
  "authorization_response_iss_parameter_supported",
] as const;

function sqlToTenant(row: any): Tenant {
  const tenant: any = { ...row };

  for (const field of JSON_FIELDS) {
    if (typeof tenant[field] === "string") {
      tenant[field] = parseJsonIfString(tenant[field]);
    }
  }

  for (const field of BOOLEAN_FIELDS) {
    if (tenant[field] !== undefined && tenant[field] !== null) {
      tenant[field] = tenant[field] === 1;
    }
  }

  tenant.session_lifetime ??= 168;
  tenant.idle_session_lifetime ??= 72;

  return removeNullProperties(tenant);
}

function tenantToSql(tenant: Partial<Tenant>): any {
  const sql: any = { ...tenant };

  stringifyProperties(
    tenant,
    JSON_FIELDS as unknown as (keyof typeof tenant)[],
    sql,
  );

  for (const field of BOOLEAN_FIELDS) {
    if ((tenant as any)[field] !== undefined) {
      sql[field] = (tenant as any)[field] ? 1 : 0;
    }
  }

  return removeUndefinedAndNull(sql);
}

export function createTenantsAdapter(db: DrizzleDb) {
  return {
    async create(params: CreateTenantParams): Promise<Tenant> {
      const tenant: Tenant = {
        id: params.id || nanoid(),
        session_lifetime: 168,
        idle_session_lifetime: 72,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...params,
      };

      const sqlTenant = tenantToSql(tenant);

      try {
        await db.insert(tenants).values(sqlTenant);
      } catch (error: any) {
        if (
          error?.message?.includes("UNIQUE constraint failed") ||
          error?.message?.includes("duplicate key") ||
          error?.code === "SQLITE_CONSTRAINT"
        ) {
          throw new HTTPException(409, {
            message: `Tenant with ID '${tenant.id}' already exists`,
          });
        }
        throw error;
      }

      return tenant;
    },

    async get(id: string): Promise<Tenant | null> {
      const result = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, id))
        .get();

      if (!result) return null;

      return sqlToTenant(result);
    },

    async list(params?: ListParams) {
      const {
        page = 0,
        per_page = 50,
        include_totals = false,
        sort,
        q,
      } = params || {};

      let query = db.select().from(tenants).$dynamic();

      if (q) {
        const filter = buildLuceneFilter(tenants, q, ["friendly_name"]);
        if (filter) query = query.where(filter);
      }

      if (sort?.sort_by) {
        const col = (tenants as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mappedTenants = results.map(sqlToTenant);

      if (!include_totals) {
        return { tenants: mappedTenants };
      }

      const [countResult] = await db.select({ count: countFn() }).from(tenants);

      return {
        tenants: mappedTenants,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async update(id: string, tenant: Partial<Tenant>): Promise<void> {
      const sqlTenant = tenantToSql({
        ...tenant,
        id,
        updated_at: new Date().toISOString(),
      });

      await db.update(tenants).set(sqlTenant).where(eq(tenants.id, id));
    },

    async remove(tenant_id: string): Promise<boolean> {
      const results = await db
        .delete(tenants)
        .where(eq(tenants.id, tenant_id))
        .returning();

      return results.length > 0;
    },
  };
}
