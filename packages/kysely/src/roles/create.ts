import { nanoid } from "nanoid";
import { Kysely } from "kysely";
import { Role, RoleInsert } from "@authhero/adapter-interfaces";
import { Database, sqlRoleSchema } from "../db";
import { z } from "@hono/zod-openapi";

type RoleDbInsert = z.infer<typeof sqlRoleSchema>;

export function create(db: Kysely<Database>) {
  return async (tenantId: string, params: RoleInsert): Promise<Role> => {
    const id = nanoid();
    const now = new Date().toISOString();

    const dbRole: RoleDbInsert = {
      id,
      ...params,
      tenant_id: tenantId,
      created_at: now,
      updated_at: now,
    };

    await db.insertInto("roles").values(dbRole).execute();

    const role: Role = {
      id,
      ...params,
      created_at: now,
      updated_at: now,
    };

    return role;
  };
}
