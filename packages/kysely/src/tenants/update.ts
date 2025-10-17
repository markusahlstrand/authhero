import { Tenant } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { tenantToSqlTenant } from "./utils";

export function update(db: Kysely<Database>) {
  return async (id: string, tenant: Partial<Tenant>): Promise<void> => {
    const sqlTenant = tenantToSqlTenant(tenant);

    const tenantWithModified = {
      ...sqlTenant,
      id,
      updated_at: new Date().toISOString(),
    };

    await db
      .updateTable("tenants")
      .set(tenantWithModified)
      .where("id", "=", id)
      .execute();
  };
}
