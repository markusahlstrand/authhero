import { Kysely } from "kysely";
import { Database } from "../db";

export function updateByClient(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    client_id: string,
    connection_ids: string[],
  ): Promise<boolean> => {
    const result = await db
      .updateTable("clients")
      .set({
        connections: JSON.stringify(connection_ids),
        updated_at: new Date().toISOString(),
      })
      .where("clients.tenant_id", "=", tenant_id)
      .where("clients.client_id", "=", client_id)
      .executeTakeFirst();

    return result.numUpdatedRows > 0;
  };
}
