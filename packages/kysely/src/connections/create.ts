import { Kysely } from "kysely";
import { Connection, ConnectionInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { generateConnectionId } from "../utils/entity-id";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ConnectionInsert,
  ): Promise<Connection> => {
    const connection = {
      id: params.id || generateConnectionId(),
      ...params,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db
      .insertInto("connections")
      .values({
        id: connection.id,
        name: connection.name,
        strategy: connection.strategy,
        response_type: connection.response_type,
        response_mode: connection.response_mode,
        created_at: connection.created_at,
        updated_at: connection.updated_at,
        // The connection options will have many different properties depending on the strategy
        options: JSON.stringify(connection.options || {}),
        tenant_id,
      })
      .execute();

    return connection;
  };
}
