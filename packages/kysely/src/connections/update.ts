import { Kysely } from "kysely";
import { ConnectionInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { flattenObject } from "../flatten";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    connection_id: string,
    connection: Partial<ConnectionInsert>,
  ): Promise<boolean> => {
    const sqlConnection = {
      ...connection,
      updated_at: new Date().toISOString(),
    };

    await db
      .updateTable("connections")
      .set(flattenObject(sqlConnection))
      .where("connections.id", "=", connection_id)
      .where("connections.tenant_id", "=", tenant_id)
      .execute();

    return true;
  };
}
