import { Kysely } from "kysely";
import { Database } from "../db";
import { UserPermissionsAdapter } from "@authhero/adapter-interfaces";
import { userPermissions } from ".";

export function createUserPermissionsAdapter(
  db: Kysely<Database>,
): UserPermissionsAdapter {
  const repo = userPermissions(db);
  return {
    create: (tenant_id, user_id, permission, organization_id) =>
      repo.create(tenant_id, user_id, permission, organization_id),
    remove: (tenant_id, user_id, permission, organization_id) =>
      repo.remove(tenant_id, user_id, permission, organization_id),
    list: (tenant_id, user_id, params, organization_id) =>
      repo.list(tenant_id, user_id, params, organization_id),
  };
}
