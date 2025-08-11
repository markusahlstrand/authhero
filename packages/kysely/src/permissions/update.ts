import { Kysely } from "kysely";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    permission_id: string,
    params: any,
  ): Promise<boolean> => {
    const updates: any = { ...params };
    if (updates.sources) updates.sources = JSON.stringify(updates.sources);

    const result = await db
      .updateTable("permissions")
      .set(updates)
      .where("permissions.tenant_id", "=", tenant_id)
      .where("permissions.id", "=", permission_id)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  };
}
