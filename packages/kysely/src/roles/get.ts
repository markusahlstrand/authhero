import { Kysely } from "kysely";
import { Role } from "@authhero/adapter-interfaces";
import { Database, sqlRoleSchema } from "../db";
import { z } from "@hono/zod-openapi";

type RoleDbRow = z.infer<typeof sqlRoleSchema>;

export function get(db: Kysely<Database>) {
  return async (tenantId: string, roleId: string): Promise<Role | null> => {
    const row = await db
      .selectFrom("roles")
      .selectAll()
      .where("roles.tenant_id", "=", tenantId)
      .where("roles.id", "=", roleId)
      .executeTakeFirst();

    if (!row) return null;

    const dbRow = row as RoleDbRow;
    const { is_system, tenant_id, metadata, ...rest } = dbRow;
    const role: Role = {
      ...rest,
      is_system: is_system ? true : undefined,
      metadata: metadata ? JSON.parse(metadata) : undefined,
    };

    return role;
  };
}
