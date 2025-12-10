import { Kysely } from "kysely";
import { Database } from "../db";

export function addClientToConnection(db: Kysely<Database>) {
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

    // Only add if not already present
    if (!connections.includes(connection_id)) {
      connections.push(connection_id);

      const result = await db
        .updateTable("clients")
        .set({
          connections: JSON.stringify(connections),
          updated_at: new Date().toISOString(),
        })
        .where("clients.tenant_id", "=", tenant_id)
        .where("clients.client_id", "=", client_id)
        .executeTakeFirst();

      return result.numUpdatedRows > 0;
    }

    return true; // Already present
  };
}
