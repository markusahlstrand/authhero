import {
  ClientRegistrationToken,
  ClientRegistrationTokenInsert,
} from "../types";

export interface ClientRegistrationTokensAdapter {
  create: (
    tenant_id: string,
    token: ClientRegistrationTokenInsert,
  ) => Promise<ClientRegistrationToken>;
  get: (
    tenant_id: string,
    id: string,
  ) => Promise<ClientRegistrationToken | null>;
  getByHash: (
    tenant_id: string,
    token_hash: string,
  ) => Promise<ClientRegistrationToken | null>;
  listByClient: (
    tenant_id: string,
    client_id: string,
  ) => Promise<ClientRegistrationToken[]>;
  markUsed: (
    tenant_id: string,
    id: string,
    used_at: string,
  ) => Promise<boolean>;
  revoke: (
    tenant_id: string,
    id: string,
    revoked_at: string,
  ) => Promise<boolean>;
  revokeByClient: (
    tenant_id: string,
    client_id: string,
    revoked_at: string,
  ) => Promise<number>;
  remove: (tenant_id: string, id: string) => Promise<boolean>;
}
