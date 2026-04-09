import { eq, and, inArray, sql } from "drizzle-orm";
import type { Connection } from "@authhero/adapter-interfaces";
import { clients, connections } from "../schema/sqlite";
import { parseJsonIfString, removeNullProperties } from "../helpers/transform";
import type { DrizzleDb } from "./types";

function sqlToConnection(row: any): Connection {
  const { tenant_id: _, is_system, options, metadata, ...rest } = row;
  return removeNullProperties({
    ...rest,
    options: parseJsonIfString(options, {}),
    metadata: parseJsonIfString(metadata),
    is_system: is_system ? true : undefined,
  });
}

export function createClientConnectionsAdapter(
  db: DrizzleDb,
) {
  return {
    async listByClient(
      tenant_id: string,
      client_id: string,
    ): Promise<Connection[]> {
      const client = await db
        .select({ connections: clients.connections })
        .from(clients)
        .where(
          and(
            eq(clients.tenant_id, tenant_id),
            eq(clients.client_id, client_id),
          ),
        )
        .get();

      if (!client) return [];

      const connectionIds: string[] = parseJsonIfString(
        client.connections,
        [],
      ) || [];

      if (connectionIds.length === 0) return [];

      const results = await db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.tenant_id, tenant_id),
            inArray(connections.id, connectionIds),
          ),
        )
        .all();

      // Return in the order specified by the client's connections array
      const mapped = results.map(sqlToConnection);
      return connectionIds
        .map((id) => mapped.find((c) => c.id === id))
        .filter(Boolean) as Connection[];
    },

    async updateByClient(
      tenant_id: string,
      client_id: string,
      connection_ids: string[],
    ): Promise<boolean> {
      const results = await db
        .update(clients)
        .set({ connections: JSON.stringify([...new Set(connection_ids)]) })
        .where(
          and(
            eq(clients.tenant_id, tenant_id),
            eq(clients.client_id, client_id),
          ),
        )
        .returning();

      return results.length > 0;
    },

    async listByConnection(
      tenant_id: string,
      connection_id: string,
    ): Promise<string[]> {
      const allClients = await db
        .select({
          client_id: clients.client_id,
          connections: clients.connections,
        })
        .from(clients)
        .where(eq(clients.tenant_id, tenant_id))
        .all();

      return allClients
        .filter((c) => {
          const connIds: string[] = parseJsonIfString(c.connections, []) || [];
          return connIds.includes(connection_id);
        })
        .map((c) => c.client_id);
    },

    async addClientToConnection(
      tenant_id: string,
      connection_id: string,
      client_id: string,
    ): Promise<boolean> {
      const client = await db
        .select({ client_id: clients.client_id })
        .from(clients)
        .where(
          and(
            eq(clients.tenant_id, tenant_id),
            eq(clients.client_id, client_id),
          ),
        )
        .get();

      if (!client) return false;

      // Atomic single-statement update using SQLite JSON functions to avoid
      // lost updates from concurrent read-modify-write cycles.
      const result = await db.run(
        sql`UPDATE clients SET connections = CASE
          WHEN connections IS NULL OR connections = '[]' OR connections = ''
            THEN json_array(${connection_id})
          WHEN EXISTS (SELECT 1 FROM json_each(connections) WHERE value = ${connection_id})
            THEN connections
          ELSE json_insert(connections, '$[#]', ${connection_id})
        END
        WHERE tenant_id = ${tenant_id} AND client_id = ${client_id}`,
      );

      // better-sqlite3 returns { changes }, D1 returns { meta: { changes } }
      const changes = result.changes ?? result.meta?.changes ?? 0;
      return changes > 0;
    },

    async removeClientFromConnection(
      tenant_id: string,
      connection_id: string,
      client_id: string,
    ): Promise<boolean> {
      // Atomic single-statement update using SQLite JSON functions to avoid
      // lost updates from concurrent read-modify-write cycles.
      const result = await db.run(
        sql`UPDATE clients SET connections = (
          SELECT COALESCE(json_group_array(je.value), '[]')
          FROM json_each(COALESCE(connections, '[]')) AS je
          WHERE je.value != ${connection_id}
        )
        WHERE tenant_id = ${tenant_id} AND client_id = ${client_id}`,
      );

      // better-sqlite3 returns { changes }, D1 returns { meta: { changes } }
      const changes = result.changes ?? result.meta?.changes ?? 0;
      return changes > 0;
    },
  };
}
