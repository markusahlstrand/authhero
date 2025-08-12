import { Kysely } from "kysely";
import { Role } from "@authhero/adapter-interfaces";
import { Database, sqlRoleSchema } from "../db";
import { z } from "@hono/zod-openapi";

type RoleDbUpdate = Partial<z.infer<typeof sqlRoleSchema>>;

export function update(db: Kysely<Database>) {
  return async (
    tenantId: string,
    roleId: string,
    params: Partial<Role>,
  ): Promise<boolean> => {
    const updates: RoleDbUpdate = {
      ...params,
      updated_at: new Date().toISOString(),
    };

    const result = await db
      .updateTable("roles")
      .set(updates)
      .where("roles.tenant_id", "=", tenantId)
      .where("roles.id", "=", roleId)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  };
}
