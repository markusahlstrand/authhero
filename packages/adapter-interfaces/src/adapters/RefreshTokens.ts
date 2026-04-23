import { RefreshToken, RefreshTokenInsert, Totals, ListParams } from "../types";

export interface ListRefreshTokenResponse extends Totals {
  refresh_tokens: RefreshToken[];
}

export interface UpdateRefreshTokenOptions {
  /**
   * When provided, the adapter also extends the parent login_session's
   * `expires_at` to `expires_at` (only if the current value is smaller).
   * The caller is expected to compute the new expiry so the adapter can
   * avoid a read-before-write and parallelise the two UPDATEs.
   */
  loginSessionBump?: {
    login_id: string;
    expires_at: string;
  };
}

export interface RefreshTokensAdapter {
  create: (
    tenant_id: string,
    refresh_token: RefreshTokenInsert,
  ) => Promise<RefreshToken>;
  get: (tenant_id: string, id: string) => Promise<RefreshToken | null>;
  list(
    tenant_id: string,
    params?: ListParams,
  ): Promise<ListRefreshTokenResponse>;
  update: (
    tenant_id: string,
    id: string,
    refresh_token: Partial<RefreshToken>,
    options?: UpdateRefreshTokenOptions,
  ) => Promise<boolean>;
  remove: (tenant_id: string, id: string) => Promise<boolean>;
  revokeByLoginSession: (
    tenant_id: string,
    login_session_id: string,
    revoked_at: string,
  ) => Promise<number>;
}
