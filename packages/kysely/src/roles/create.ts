import { Kysely } from "kysely";
import { Role, RoleInsert, CreateOptions } from "@authhero/adapter-interfaces";
import { Database, sqlRoleSchema } from "../db";
import { z } from "@hono/zod-openapi";
import { nanoid } from "nanoid";

type RoleDbInsert = z.infer<typeof sqlRoleSchema>;

export function create(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: RoleInsert & { is_system?: boolean },
    options?: CreateOptions,
  ): Promise<Role> => {
    const importMetadata = options?.importMetadata;
    const now = new Date().toISOString();
    const created_at = importMetadata?.created_at ?? now;
    const updated_at = importMetadata?.updated_at ?? now;
    // Use provided id or generate a new one
    const id = importMetadata?.id || params.id || nanoid();

    const { is_system, id: _providedId, metadata, ...rest } = params;

    const dbRole: RoleDbInsert = {
      id,
      ...rest,
      tenant_id: tenantId,
      is_system: is_system ? 1 : 0,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
      created_at,
      updated_at,
    };

    await db.insertInto("roles").values(dbRole).execute();

    const role: Role = {
      id,
      ...rest,
      is_system: is_system ? true : undefined,
      metadata,
      created_at,
      updated_at,
    };

    return role;
  };
}
