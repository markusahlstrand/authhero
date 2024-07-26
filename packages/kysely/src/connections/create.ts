import { nanoid } from "nanoid";
import { Kysely } from "kysely";
import { Connection, ConnectionInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ConnectionInsert,
  ): Promise<Connection> => {
    const connection = {
      id: nanoid(),
      ...params,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db
      .insertInto("connections")
      .values({ ...connection, tenant_id })
      .execute();

    return connection;
  };
}