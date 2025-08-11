import { Kysely } from "kysely";
import { Permission } from "@authhero/adapter-interfaces";
import { Database } from "../db";

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

    return {
      ...row,
      sources: row.sources ? JSON.parse(row.sources as any) : [],
    } as Permission;
  };
}
