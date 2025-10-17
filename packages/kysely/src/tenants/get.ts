import { Kysely } from "kysely";
import { Tenant } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { sqlTenantToTenant } from "./utils";

export function get(db: Kysely<Database>) {
  return async (id: string): Promise<Tenant | null> => {
    const tenant = await db
      .selectFrom("tenants")
      .where("tenants.id", "=", id)
      .selectAll()
      .executeTakeFirst();

    if (!tenant) {
      return null;
    }

    return sqlTenantToTenant(tenant);
  };
}
