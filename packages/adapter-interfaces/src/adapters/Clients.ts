import { Client, ClientInsert, Totals } from "../types";
import { ListParams } from "../types/ListParams";

/**
 * Result from getByClientId including tenant_id since client_id alone
 * is used to look up the client across all tenants
 */
export interface ClientWithTenantId extends Client {
  tenant_id: string;
}

export interface ClientsAdapter {
  create(tenant_id: string, params: ClientInsert): Promise<Client>;
  get(tenant_id: string, client_id: string): Promise<Client | null>;
  /**
   * Get a client by client_id only (without tenant_id).
   * Returns the client with its tenant_id since the caller needs to know
   * which tenant the client belongs to.
   */
  getByClientId(client_id: string): Promise<ClientWithTenantId | null>;
  remove(tenant_id: string, client_id: string): Promise<boolean>;
  list(
    tenant_id: string,
    params?: ListParams,
  ): Promise<{ clients: Client[]; totals?: Totals }>;
  update(
    tenant_id: string,
    client_id: string,
    client: Partial<Client>,
  ): Promise<boolean>;
}
