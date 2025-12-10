import { Kysely, sql } from "kysely";
import { Database } from "../db";

export function listByConnection(db: Kysely<Database>) {
  return async (tenant_id: string, connection_id: string): Promise<string[]> => {
    // Find all clients that have this connection_id in their connections array
    // We need to search in the JSON array stored as a text field
    const clients = await db
      .selectFrom("clients")
      .where("clients.tenant_id", "=", tenant_id)
      .where(
        sql<boolean>`JSON_CONTAINS(connections, JSON_QUOTE(${connection_id}))`,
      )
      .select("client_id")
      .execute();

    return clients.map((c) => c.client_id);
  };
}
