import { ScimExternalId, ScimExternalIdInsert } from "../types/ScimExternalId";

export interface ScimExternalIdsAdapter {
  create: (
    tenant_id: string,
    externalId: ScimExternalIdInsert,
  ) => Promise<ScimExternalId>;
  getByExternalId: (
    tenant_id: string,
    connection_id: string,
    external_id: string,
  ) => Promise<ScimExternalId | null>;
  getByUserId: (
    tenant_id: string,
    connection_id: string,
    user_id: string,
  ) => Promise<ScimExternalId | null>;
  remove: (
    tenant_id: string,
    connection_id: string,
    user_id: string,
  ) => Promise<boolean>;
}
