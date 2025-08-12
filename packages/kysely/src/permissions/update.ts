import { Kysely } from "kysely";
import { Permission } from "@authhero/adapter-interfaces";
import { Database, sqlPermissionSchema } from "../db";
import { z } from "@hono/zod-openapi";

type PermissionDbUpdate = Partial<z.infer<typeof sqlPermissionSchema>>;

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    permission_id: string,
    params: Partial<Permission>,
  ): Promise<boolean> => {
    const { sources, ...rest } = params;

    const updates: PermissionDbUpdate = { ...rest };

    if (sources !== undefined) {
      updates.sources = JSON.stringify(sources);
    }

    const result = await db
      .updateTable("permissions")
      .set(updates)
      .where("permissions.tenant_id", "=", tenant_id)
      .where("permissions.id", "=", permission_id)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  };
}
