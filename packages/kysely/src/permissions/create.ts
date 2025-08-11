import { nanoid } from "nanoid";
import { Kysely } from "kysely";
import {
  Permission,
  PermissionInsert,
  permissionSchema,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: PermissionInsert,
  ): Promise<Permission> => {
    const id = nanoid();
    const withId = { id, ...params } as any;
    const permission = permissionSchema.parse(withId);

    await db
      .insertInto("permissions")
      .values({
        id,
        tenant_id,
        permission_name: permission.permission_name,
        resource_server_identifier: permission.resource_server_identifier,
        resource_server_name: permission.resource_server_name,
        description: permission.description,
        sources: permission.sources ? JSON.stringify(permission.sources) : "[]",
      })
      .execute();

    return permission;
  };
}
