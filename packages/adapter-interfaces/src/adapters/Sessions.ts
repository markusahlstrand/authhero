import { Session, SessionInsert, Totals } from "../types";
import { ListParams } from "../types/ListParams";

export interface ListSesssionsResponse extends Totals {
  sessions: Session[];
}

export interface SessionsAdapter {
  /**
   * ADAPTER RESPONSIBILITY (footgun): when a session is created with an
   * `expires_at`/`idle_expires_at`, the adapter MUST extend the parent
   * `login_session` (referenced by `login_session_id`) so it lives at least as
   * long as the session — never shortening it (only bump when the session's
   * expiry is further out than the login_session's current expiry).
   *
   * If an adapter skips this, a long-lived session outlives its login_session
   * and gets orphaned when cleanup reaps the login_session. The bump must be
   * atomic with the insert. See `refreshTokens` for the equivalent contract.
   */
  create: (tenant_id: string, session: SessionInsert) => Promise<Session>;
  get: (tenant_id: string, id: string) => Promise<Session | null>;
  list(tenantId: string, params?: ListParams): Promise<ListSesssionsResponse>;
  /**
   * ADAPTER RESPONSIBILITY (footgun): when an update moves `expires_at`/
   * `idle_expires_at` forward (session renewal), the adapter MUST extend the
   * parent `login_session` the same way `create` does (never shortening). See
   * the note on `create` above.
   */
  update: (
    tenant_id: string,
    id: string,
    session: Partial<Session>,
  ) => Promise<boolean>;
  remove: (tenant_id: string, id: string) => Promise<boolean>;
}
