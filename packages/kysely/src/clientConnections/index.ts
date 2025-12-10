import { Kysely } from "kysely";
import { ClientConnectionsAdapter } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { listByClient } from "./listByClient";
import { updateByClient } from "./updateByClient";
import { listByConnection } from "./listByConnection";
import { addClientToConnection } from "./addClientToConnection";
import { removeClientFromConnection } from "./removeClientFromConnection";

export function createClientConnectionsAdapter(
  db: Kysely<Database>,
): ClientConnectionsAdapter {
  return {
    listByClient: listByClient(db),
    updateByClient: updateByClient(db),
    listByConnection: listByConnection(db),
    addClientToConnection: addClientToConnection(db),
    removeClientFromConnection: removeClientFromConnection(db),
  };
}
