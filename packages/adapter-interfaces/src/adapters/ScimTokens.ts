import { ScimToken, ScimTokenInsert } from "../types/ScimToken";

export interface ScimTokensAdapter {
  create: (tenant_id: string, token: ScimTokenInsert) => Promise<ScimToken>;
  get: (tenant_id: string, token_id: string) => Promise<ScimToken | null>;
  // Used by the SCIM auth middleware to resolve a presented bearer token.
  getByHash: (
    tenant_id: string,
    token_hash: string,
  ) => Promise<ScimToken | null>;
  listByConnection: (
    tenant_id: string,
    connection_id: string,
  ) => Promise<ScimToken[]>;
  markUsed: (
    tenant_id: string,
    token_id: string,
    last_used_at: string,
  ) => Promise<boolean>;
  remove: (tenant_id: string, token_id: string) => Promise<boolean>;
}
