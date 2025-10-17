import { Kysely } from "kysely";
import { nanoid } from "nanoid";
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

    await db.insertInto("tenants").values(sqlTenant).execute();

    return tenant;
  };
}
