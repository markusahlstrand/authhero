import { eq, and, inArray } from "drizzle-orm";
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
      await db
        .update(clients)
        .set({ connections: JSON.stringify(connection_ids) })
        .where(
          and(
            eq(clients.tenant_id, tenant_id),
            eq(clients.client_id, client_id),
          ),
        );

      return true;
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
        .select({ connections: clients.connections })
        .from(clients)
        .where(
          and(
            eq(clients.tenant_id, tenant_id),
            eq(clients.client_id, client_id),
          ),
        )
        .get();

      if (!client) return false;

      const connectionIds: string[] = parseJsonIfString(
        client.connections,
        [],
      ) || [];

      if (connectionIds.includes(connection_id)) return true;

      connectionIds.push(connection_id);

      await db
        .update(clients)
        .set({ connections: JSON.stringify(connectionIds) })
        .where(
          and(
            eq(clients.tenant_id, tenant_id),
            eq(clients.client_id, client_id),
          ),
        );

      return true;
    },

    async removeClientFromConnection(
      tenant_id: string,
      connection_id: string,
      client_id: string,
    ): Promise<boolean> {
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

      if (!client) return true;

      const connectionIds: string[] = parseJsonIfString(
        client.connections,
        [],
      ) || [];

      const filtered = connectionIds.filter((id) => id !== connection_id);

      if (filtered.length === connectionIds.length) return true;

      await db
        .update(clients)
        .set({ connections: JSON.stringify(filtered) })
        .where(
          and(
            eq(clients.tenant_id, tenant_id),
            eq(clients.client_id, client_id),
          ),
        );

      return true;
    },
  };
}
