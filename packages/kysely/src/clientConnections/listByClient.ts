import { Kysely } from "kysely";
import { Connection } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { removeNullProperties } from "../helpers/remove-nulls";

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
    const connections = await db
      .selectFrom("connections")
      .where("connections.tenant_id", "=", tenant_id)
      .where("connections.id", "in", connectionIds)
      .selectAll()
      .execute();

    // Transform each connection
    const connectionMap = new Map(
      connections.map((c) => [
        c.id,
        removeNullProperties({
          ...c,
          options: JSON.parse(c.options),
        }) as Connection,
      ]),
    );

    // Return connections in the order specified in the client's connections array
    return connectionIds
      .map((id) => connectionMap.get(id))
      .filter((c): c is Connection => c !== undefined);
  };
}
