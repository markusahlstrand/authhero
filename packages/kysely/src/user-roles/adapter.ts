import { Kysely } from "kysely";
import { Database } from "../db";
import { UserRolesAdapter } from "@authhero/adapter-interfaces";
import { userRoles } from ".";

export function createUserRolesAdapter(db: Kysely<Database>): UserRolesAdapter {
  const repo = userRoles(db);
  return {
    list: (tenantId, userId, params, organizationId) =>
      repo.list(tenantId, userId, params, organizationId),
    create: (tenantId, userId, roleId, organizationId) =>
      repo.create(tenantId, userId, roleId, organizationId),
    remove: (tenantId, userId, roleId, organizationId) =>
      repo.remove(tenantId, userId, roleId, organizationId),
  };
}
