import { Kysely } from "kysely";
import { ConnectionInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    connection_id: string,
    connection: Partial<ConnectionInsert>,
  ): Promise<boolean> => {
    const { is_system, ...rest } = connection;

    const sqlConnection = {
      ...rest,
      is_system: is_system !== undefined ? (is_system ? 1 : 0) : undefined,
      updated_at: new Date().toISOString(),
    };

    await db
      .updateTable("connections")
      .set({
        ...sqlConnection,
        options: sqlConnection.options
          ? JSON.stringify(sqlConnection.options)
          : undefined,
      })
      .where("connections.id", "=", connection_id)
      .where("connections.tenant_id", "=", tenant_id)
      .execute();

    return true;
  };
}
