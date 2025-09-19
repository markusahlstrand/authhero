import { ListParams } from "../types/ListParams";
import { ClientGrant, ClientGrantInsert, Totals } from "../types";

export interface ListClientGrantsResponse extends Totals {
  client_grants: ClientGrant[];
}

export interface ClientGrantsAdapter {
  create(tenant_id: string, params: ClientGrantInsert): Promise<ClientGrant>;
  get(tenant_id: string, id: string): Promise<ClientGrant | null>;
  list(
    tenant_id: string,
    params?: ListParams,
  ): Promise<ListClientGrantsResponse>;
  update(
    tenant_id: string,
    id: string,
    clientGrant: Partial<ClientGrantInsert>,
  ): Promise<boolean>;
  remove(tenant_id: string, id: string): Promise<boolean>;
}
