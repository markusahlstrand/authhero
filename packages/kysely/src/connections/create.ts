import { Kysely } from "kysely";
import { Connection, ConnectionInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { generateConnectionId } from "../utils/entity-id";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ConnectionInsert,
  ): Promise<Connection> => {
    const { synced, ...rest } = params;

    const connection: Connection = {
      id: rest.id || generateConnectionId(),
      ...rest,
      synced: synced ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db
      .insertInto("connections")
      .values({
        ...connection,
        synced: synced ? 1 : 0,
        // The connection options will have many different properties depending on the strategy
        options: JSON.stringify(connection.options || {}),
        tenant_id,
      })
      .execute();

    return connection;
  };
}
