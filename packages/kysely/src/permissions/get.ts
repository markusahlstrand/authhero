import { Kysely } from "kysely";
import { Permission } from "@authhero/adapter-interfaces";
import { Database, sqlPermissionSchema } from "../db";
import { z } from "@hono/zod-openapi";

type PermissionDbRow = z.infer<typeof sqlPermissionSchema>;

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    permission_id: string,
  ): Promise<Permission | null> => {
    const row = await db
      .selectFrom("permissions")
      .selectAll()
      .where("permissions.tenant_id", "=", tenant_id)
      .where("permissions.id", "=", permission_id)
      .executeTakeFirst();

    if (!row) return null;

    const dbRow = row as PermissionDbRow;
    const { sources, ...rest } = dbRow;

    const permission: Permission = {
      ...rest,
      sources: sources ? JSON.parse(sources) : [],
    };

    return permission;
  };
}
