import { Kysely } from "kysely";
import { ConnectionInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    connection_id: string,
    connection: Partial<ConnectionInsert>,
  ): Promise<boolean> => {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // Only include fields that exist in the database schema
    if (connection.name !== undefined) updateData.name = connection.name;
    if (connection.strategy !== undefined)
      updateData.strategy = connection.strategy;
    if (connection.response_type !== undefined)
      updateData.response_type = connection.response_type;
    if (connection.response_mode !== undefined)
      updateData.response_mode = connection.response_mode;
    if (connection.options !== undefined)
      updateData.options = JSON.stringify(connection.options);

    await db
      .updateTable("connections")
      .set(updateData)
      .where("connections.id", "=", connection_id)
      .where("connections.tenant_id", "=", tenant_id)
      .execute();

    return true;
  };
}
