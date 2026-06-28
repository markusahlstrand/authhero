import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { HTTPException } from "hono/http-exception";
import {
  CreateTenantParams,
  Tenant,
  CreateOptions,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { tenantToSqlTenant } from "./utils";

export function create(db: Kysely<Database>) {
  return async (
    params: CreateTenantParams,
    options?: CreateOptions,
  ): Promise<Tenant> => {
    const importMetadata = options?.importMetadata;
    const now = new Date().toISOString();
    const tenant: Tenant = {
      id: importMetadata?.id || params.id || nanoid(),
      ...params,
      created_at: importMetadata?.created_at ?? now,
      updated_at: importMetadata?.updated_at ?? now,
    };

    const sqlTenant = tenantToSqlTenant(tenant);

    try {
      await db.insertInto("tenants").values(sqlTenant).execute();
    } catch (error: any) {
      // PlanetScale surfaces the MySQL "Duplicate entry ... for key 'PRIMARY'"
      // message rather than an ER_DUP_ENTRY code on `error.code`, so match the
      // message text alongside the per-driver codes used elsewhere in this
      // package.
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
