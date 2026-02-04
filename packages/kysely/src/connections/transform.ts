import { Connection } from "@authhero/adapter-interfaces";
import { removeNullProperties } from "../helpers/remove-nulls";
import { Database } from "../db";
import { Selectable } from "kysely";

type DbConnection = Selectable<Database["connections"]>;

/**
 * Transform a raw database connection row to a Connection object.
 * Handles:
 * - Converting is_system from number (0/1) to boolean/undefined
 * - Parsing the JSON options field
 * - Removing null properties
 */
export function transformConnection(dbConnection: DbConnection): Connection {
  const { is_system, ...rest } = dbConnection;
  return removeNullProperties({
    ...rest,
    is_system: is_system ? true : undefined,
    options: JSON.parse(dbConnection.options),
  });
}

/**
 * Transform multiple raw database connection rows to Connection objects.
 */
export function transformConnections(
  dbConnections: DbConnection[],
): Connection[] {
  return dbConnections.map(transformConnection);
}
