import { ListParams } from "../types/ListParams";
import { ResourceServer, ResourceServerInsert, Totals } from "../types";
import { CreateOptions } from "../types/ImportMetadata";

export interface ListResourceServersResponse extends Totals {
  resource_servers: ResourceServer[];
}

export interface ResourceServersAdapter {
  create(
    tenant_id: string,
    params: ResourceServerInsert,
    options?: CreateOptions,
  ): Promise<ResourceServer>;
  get(tenant_id: string, id: string): Promise<ResourceServer | null>;
  list(
    tenant_id: string,
    params?: ListParams,
  ): Promise<ListResourceServersResponse>;
  update(
    tenant_id: string,
    id: string,
    resourceServer: Partial<ResourceServerInsert>,
  ): Promise<boolean>;
  remove(tenant_id: string, id: string): Promise<boolean>;
}
