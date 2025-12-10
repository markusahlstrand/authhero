import { Kysely } from "kysely";
import { Database } from "../db";

export function listByConnection(db: Kysely<Database>) {
  return async (tenant_id: string, connection_id: string): Promise<string[]> => {
    // Fetch all clients for the tenant and filter in application code
    // This is database-agnostic (works with SQLite, MySQL, PostgreSQL, etc.)
    const clients = await db
      .selectFrom("clients")
      .where("clients.tenant_id", "=", tenant_id)
      .select(["client_id", "connections"])
      .execute();

    // Filter clients that have this connection_id in their connections array
    const matchingClientIds: string[] = [];
    for (const client of clients) {
      const connections: string[] = JSON.parse(client.connections || "[]");
      if (connections.includes(connection_id)) {
        matchingClientIds.push(client.client_id);
      }
    }

    return matchingClientIds;
  };
}
