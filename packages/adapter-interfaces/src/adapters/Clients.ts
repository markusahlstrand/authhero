import { Client, ClientInsert, Totals } from "../types";
import { ListParams } from "../types/ListParams";

export interface ClientsAdapter {
  create(tenant_id: string, params: ClientInsert): Promise<Client>;
  get(tenant_id: string, client_id: string): Promise<Client | null>;
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
