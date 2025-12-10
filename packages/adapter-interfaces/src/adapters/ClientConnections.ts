import { Connection } from "../types";

export interface ClientConnectionsAdapter {
  /**
   * Get all connections enabled for a specific client
   * Returns connections in the order they were stored
   */
  listByClient(tenant_id: string, client_id: string): Promise<Connection[]>;

  /**
   * Update the connections for a client
   * The connection_ids array determines both which connections are enabled
   * and their display order on the login page
   */
  updateByClient(
    tenant_id: string,
    client_id: string,
    connection_ids: string[],
  ): Promise<boolean>;

  /**
   * Get all clients that have a specific connection enabled
   */
  listByConnection(tenant_id: string, connection_id: string): Promise<string[]>;

  /**
   * Add a client to a connection (add client_id to the list of clients using this connection)
   */
  addClientToConnection(
    tenant_id: string,
    connection_id: string,
    client_id: string,
  ): Promise<boolean>;

  /**
   * Remove a client from a connection
   */
  removeClientFromConnection(
    tenant_id: string,
    connection_id: string,
    client_id: string,
  ): Promise<boolean>;
}
