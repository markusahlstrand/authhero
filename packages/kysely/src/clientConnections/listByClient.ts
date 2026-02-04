import { Kysely } from "kysely";
import { Connection } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { transformConnection } from "../connections/transform";

export function listByClient(db: Kysely<Database>) {
  return async (tenant_id: string, client_id: string): Promise<Connection[]> => {
    // First get the client's connections array
    const client = await db
      .selectFrom("clients")
      .where("clients.tenant_id", "=", tenant_id)
      .where("clients.client_id", "=", client_id)
      .select("connections")
      .executeTakeFirst();

    if (!client) {
      return [];
    }

    const connectionIds: string[] = JSON.parse(client.connections || "[]");

    if (connectionIds.length === 0) {
      return [];
    }

    // Get all connections that are in the client's connections array
    const dbConnections = await db
      .selectFrom("connections")
      .where("connections.tenant_id", "=", tenant_id)
      .where("connections.id", "in", connectionIds)
      .selectAll()
      .execute();

    // Transform and create a map for ordering
    const connectionMap = new Map(
      dbConnections.map((c) => [c.id, transformConnection(c)]),
    );

    // Return connections in the order specified in the client's connections array
    return connectionIds
      .map((id) => connectionMap.get(id))
      .filter((c): c is Connection => c !== undefined);
  };
}
