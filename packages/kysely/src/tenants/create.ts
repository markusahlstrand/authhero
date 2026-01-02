import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { HTTPException } from "hono/http-exception";
import { CreateTenantParams, Tenant } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { tenantToSqlTenant } from "./utils";

export function create(db: Kysely<Database>) {
  return async (params: CreateTenantParams): Promise<Tenant> => {
    const tenant: Tenant = {
      id: params.id || nanoid(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...params,
    };

    const sqlTenant = tenantToSqlTenant(tenant);

    try {
      await db.insertInto("tenants").values(sqlTenant).execute();
    } catch (error: any) {
      // Check if it's a unique constraint violation
      if (
        error?.message?.includes("UNIQUE constraint failed") ||
        error?.message?.includes("duplicate key") ||
        error?.code === "SQLITE_CONSTRAINT" ||
        error?.code === "23505" // PostgreSQL unique violation
      ) {
        throw new HTTPException(409, {
          message: `Tenant with ID '${tenant.id}' already exists`,
        });
      }
      throw error;
    }

    return tenant;
  };
}
