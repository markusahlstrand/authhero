import {
  ScimConfiguration,
  ScimConfigurationInsert,
} from "../types/ScimConfiguration";

export interface ScimConfigurationsAdapter {
  create: (
    tenant_id: string,
    configuration: ScimConfigurationInsert,
  ) => Promise<ScimConfiguration>;
  get: (
    tenant_id: string,
    connection_id: string,
  ) => Promise<ScimConfiguration | null>;
  update: (
    tenant_id: string,
    connection_id: string,
    configuration: Partial<ScimConfigurationInsert>,
  ) => Promise<boolean>;
  remove: (tenant_id: string, connection_id: string) => Promise<boolean>;
}
