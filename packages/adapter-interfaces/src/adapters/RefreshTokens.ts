import { RefreshToken, RefreshTokenInsert, Totals, ListParams } from "../types";

/**
 * List params for refresh tokens, with `user_id` as a first-class exact
 * predicate.
 *
 * Selecting a user through the `q` Lucene grammar is not safe here: both SQL
 * adapters split `q` on ` OR ` *before* tokenizing, so a user id containing
 * ` OR user_id:<other> OR ` yields a clean middle clause that matches another
 * user's rows — quoting the value does not prevent it, because the quotes only
 * bracket the first and last fragments. This field compiles to an equality
 * comparison instead, so the id is never parsed as query syntax.
 */
export interface RefreshTokenListParams extends ListParams {
  user_id?: string;
}

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

/**
 * Update payload for a refresh token.
 *
 * The two expiry columns are three-valued on the way in: `undefined` leaves
 * the stored value alone, a string overwrites it, and `null` clears it — the
 * token stops expiring on that axis.
 *
 * Clearing exists for the in-place refresh exchange. A rotating client
 * reconciles a changed refresh-token config for free, because the child row is
 * minted from the current lifetimes; a non-rotating one keeps handing back the
 * row it was given, so switching a client to non-expiring has to be able to
 * drop the expiries that row was stamped with.
 */
export type RefreshTokenUpdate = Partial<
  Omit<RefreshToken, "expires_at" | "idle_expires_at">
> & {
  expires_at?: string | null;
  idle_expires_at?: string | null;
};

export interface RefreshTokensAdapter {
  create: (
    tenant_id: string,
    refresh_token: RefreshTokenInsert,
  ) => Promise<RefreshToken>;
  get: (tenant_id: string, id: string) => Promise<RefreshToken | null>;
  /**
   * Look up a refresh token by its plaintext `token_lookup` slice (extracted
   * from the wire format `rt_<lookup>.<secret>`). Returns null if no row
   * matches. Callers must verify the secret hash before trusting the row.
   */
  getByLookup: (
    tenant_id: string,
    token_lookup: string,
  ) => Promise<RefreshToken | null>;
  list(
    tenant_id: string,
    params?: RefreshTokenListParams,
  ): Promise<ListRefreshTokenResponse>;
  update: (
    tenant_id: string,
    id: string,
    refresh_token: RefreshTokenUpdate,
    options?: UpdateRefreshTokenOptions,
  ) => Promise<boolean>;
  remove: (tenant_id: string, id: string) => Promise<boolean>;
  /**
   * Soft-revoke every refresh token belonging to a user that isn't already
   * revoked. Exact tenant + user predicates, so nothing goes through the `q`
   * grammar.
   *
   * The `revoked_at IS NULL` guard also makes this safe to run concurrently:
   * a second bulk revocation cannot overwrite the audit timestamp written by
   * the first.
   *
   * Returns the number of tokens revoked.
   */
  revokeByUser: (
    tenant_id: string,
    user_id: string,
    revoked_at: string,
  ) => Promise<number>;
  revokeByLoginSession: (
    tenant_id: string,
    login_session_id: string,
    revoked_at: string,
  ) => Promise<number>;
  /**
   * Soft-revoke every refresh token owned by a session that isn't already
   * revoked. This is the cascade behind "revoking a session revokes its
   * refresh tokens" — deliberate revocation only.
   *
   * It must never be called for a session that merely *expired* or that
   * cleanup removed: a refresh token is designed to outlive its session, and
   * killing tokens on an SSO timeout would log out every long-lived native
   * client. Lifetime does not couple; revocation does.
   *
   * Rows minted before `session_id` existed carry no value here and are not
   * matched — callers sweep `revokeByLoginSession` alongside this until those
   * rows have aged out (#1259).
   *
   * Returns the number of tokens revoked.
   */
  revokeBySession: (
    tenant_id: string,
    session_id: string,
    revoked_at: string,
  ) => Promise<number>;
  /**
   * Soft-revoke every refresh token that shares `family_id` and isn't already
   * revoked. Used for reuse detection (entire rotation chain torched) and for
   * admin revocations that should propagate to descendants.
   */
  revokeFamily: (
    tenant_id: string,
    family_id: string,
    revoked_at: string,
  ) => Promise<number>;
}
