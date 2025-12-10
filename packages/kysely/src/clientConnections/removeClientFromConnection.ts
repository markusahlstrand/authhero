import { Kysely } from "kysely";
import { Database } from "../db";

export function removeClientFromConnection(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    connection_id: string,
    client_id: string,
  ): Promise<boolean> => {
    // Get the client's current connections
    const client = await db
      .selectFrom("clients")
      .where("clients.tenant_id", "=", tenant_id)
      .where("clients.client_id", "=", client_id)
      .select("connections")
      .executeTakeFirst();

    if (!client) {
      return false;
    }

    const connections: string[] = JSON.parse(client.connections || "[]");
    const filteredConnections = connections.filter((id) => id !== connection_id);

    // Only update if something changed
    if (filteredConnections.length !== connections.length) {
      const result = await db
        .updateTable("clients")
        .set({
          connections: JSON.stringify(filteredConnections),
          updated_at: new Date().toISOString(),
        })
        .where("clients.tenant_id", "=", tenant_id)
        .where("clients.client_id", "=", client_id)
        .executeTakeFirst();

      return result.numUpdatedRows > 0;
    }

    return true; // Nothing to remove
  };
}
