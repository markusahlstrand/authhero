import { Kysely } from "kysely";
import { Database } from "../db";
import { UserRolesAdapter } from "@authhero/adapter-interfaces";
import { userRoles } from ".";

export function createUserRolesAdapter(db: Kysely<Database>): UserRolesAdapter {
  const repo = userRoles(db);
  return {
    list: (tenantId, userId) => repo.list(tenantId, userId),
    assign: (tenantId, userId, roles) => repo.assign(tenantId, userId, roles),
    remove: (tenantId, userId, roles) => repo.remove(tenantId, userId, roles),
  };
}
