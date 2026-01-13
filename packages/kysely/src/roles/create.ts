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
    // Use provided id or generate a new one
    const id = params.id || nanoid();

    const { is_system, id: _providedId, metadata, ...rest } = params;

    const dbRole: RoleDbInsert = {
      id,
      ...rest,
      tenant_id: tenantId,
      is_system: is_system ? 1 : 0,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
      created_at: now,
      updated_at: now,
    };

    await db.insertInto("roles").values(dbRole).execute();

    const role: Role = {
      id,
      ...rest,
      is_system: is_system ? true : undefined,
      metadata,
      created_at: now,
      updated_at: now,
    };

    return role;
  };
}
