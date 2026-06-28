import { OrganizationConnection, OrganizationConnectionInsert } from "../types";
import { CreateOptions } from "../types/ImportMetadata";

// Junction store: one row per (tenant_id, organization_id, connection_id).
// Mirrors Auth0's `/organizations/{id}/enabled_connections` resource.
export interface OrganizationConnectionsAdapter {
  create(
    tenant_id: string,
    organization_id: string,
    params: OrganizationConnectionInsert,
    options?: CreateOptions,
  ): Promise<OrganizationConnection>;

  list(
    tenant_id: string,
    organization_id: string,
  ): Promise<OrganizationConnection[]>;

  get(
    tenant_id: string,
    organization_id: string,
    connection_id: string,
  ): Promise<OrganizationConnection | null>;

  update(
    tenant_id: string,
    organization_id: string,
    connection_id: string,
    params: Partial<Omit<OrganizationConnectionInsert, "connection_id">>,
  ): Promise<OrganizationConnection | null>;

  remove(
    tenant_id: string,
    organization_id: string,
    connection_id: string,
  ): Promise<boolean>;
}
