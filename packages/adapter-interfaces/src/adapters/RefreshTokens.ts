import { RefreshToken, RefreshTokenInsert, Totals, ListParams } from "../types";

interface RefreshTokenResponse extends Totals {
  refresh_tokens: RefreshToken[];
}

export interface RefreshTokensAdapter {
  create: (
    tenant_id: string,
    session: RefreshTokenInsert,
  ) => Promise<RefreshToken>;
  get: (tenant_id: string, id: string) => Promise<RefreshToken | null>;
  list(tenantId: string, params?: ListParams): Promise<RefreshTokenResponse>;
  update: (
    tenant_id: string,
    id: string,
    refresh_token: Partial<RefreshToken>,
  ) => Promise<boolean>;
  remove: (tenant_id: string, id: string) => Promise<boolean>;
}
