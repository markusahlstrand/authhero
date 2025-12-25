import { Kysely } from "kysely";
import { Role, RoleInsert } from "@authhero/adapter-interfaces";
import { Database, sqlRoleSchema } from "../db";
import { z } from "@hono/zod-openapi";
import { nanoid } from "nanoid";

type RoleDbInsert = z.infer<typeof sqlRoleSchema>;

export function create(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: RoleInsert & { is_system?: boolean },
  ): Promise<Role> => {
    const now = new Date().toISOString();
    const id = nanoid();

    const { is_system, ...rest } = params;

    const dbRole: RoleDbInsert = {
      id,
      ...rest,
      tenant_id: tenantId,
      is_system: is_system ? 1 : 0,
      created_at: now,
      updated_at: now,
    };

    await db.insertInto("roles").values(dbRole).execute();

    const role: Role = {
      id,
      ...rest,
      is_system: is_system ?? false,
      created_at: now,
      updated_at: now,
    };

    return role;
  };
}
