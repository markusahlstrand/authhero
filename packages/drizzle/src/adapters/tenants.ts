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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...params,
      };

      const sqlTenant = tenantToSql(tenant);

      try {
        await db.insert(tenants).values(sqlTenant);
      } catch (error: any) {
        const message: string = error?.message ?? "";
        if (
          message.includes("UNIQUE constraint failed") ||
          message.includes("Duplicate entry") ||
          message.includes("duplicate key") ||
          message.includes("AlreadyExists") ||
          error?.code === "SQLITE_CONSTRAINT" ||
          error?.code === "SQLITE_CONSTRAINT_UNIQUE" ||
          error?.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
          error?.code === "ER_DUP_ENTRY" ||
          error?.code === "23505"
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

      const filter = q
        ? buildLuceneFilter(tenants, q, ["friendly_name"])
        : undefined;

      let query = db.select().from(tenants).$dynamic();

      if (filter) query = query.where(filter);

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

      let countQuery = db.select({ count: countFn() }).from(tenants).$dynamic();

      if (filter) countQuery = countQuery.where(filter);

      const [countResult] = await countQuery;

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
