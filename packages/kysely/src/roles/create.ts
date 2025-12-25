import { Kysely } from "kysely";
import { Role, RoleInsert } from "@authhero/adapter-interfaces";
import { Database, sqlRoleSchema } from "../db";
import { z } from "@hono/zod-openapi";
import { nanoid } from "nanoid";

type RoleDbInsert = z.infer<typeof sqlRoleSchema>;

export function create(db: Kysely<Database>) {
  return async (tenantId: string, params: RoleInsert & { synced?: boolean }): Promise<Role> => {
    const now = new Date().toISOString();
    const id = nanoid();

    const { synced, ...rest } = params;

    const dbRole: RoleDbInsert = {
      id,
      ...rest,
      tenant_id: tenantId,
      synced: synced ? 1 : 0,
      created_at: now,
      updated_at: now,
    };

    await db.insertInto("roles").values(dbRole).execute();

    const role: Role = {
      id,
      ...rest,
      synced,
      created_at: now,
      updated_at: now,
    };

    return role;
  };
}
