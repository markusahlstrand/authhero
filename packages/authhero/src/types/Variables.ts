import { LoginSession } from "@authhero/adapter-interfaces";
import { CountryCode } from "libphonenumber-js";
import { Auth0Client } from "./Auth0Client";

export type Variables = {
  tenant_id: string;
  ip: string;
  client_id?: string;
  user_id?: string;
  username?: string;
  connection?: string;
  body?: any;
  log?: string;
  custom_domain?: string;
  host?: string;
  // This is set by auth middleware
  user?: {
    sub: string;
    tenant_id: string;
    org_name?: string;
    org_id?: string;
    scope?: string;
  };
  // Organization claims from token (set by auth middleware)
  organization_id?: string;
  org_name?: string;
  // This is used by the hooks
  loginSession?: LoginSession;
  // Client info from middleware
  auth0_client?: Auth0Client;
  useragent?: string;
  countryCode?: CountryCode;
  // Outbox event ID promises created during this request (for per-request processing).
  // Promises are pushed synchronously so that non-awaited logMessage calls are still captured.
  outboxEventPromises?: Promise<string>[];
  // Promises registered via `waitUntil` on non-Workers runtimes. The outbox
  // middleware awaits these in its finally block so background work (log
  // writes, outbox webhook dispatch) is observable by tests and completes
  // before the process exits.
  backgroundPromises?: Promise<void>[];
  // True when the /oauth/token request authenticated the client via an
  // RFC 7523 `client_assertion` (private_key_jwt or client_secret_jwt). Grant
  // handlers consult this so they can skip the client_secret comparison.
  client_authenticated_via_assertion?: boolean;
  // Set by the action-execution runtime after a trigger fires (post-login,
  // credentials-exchange, …) so the surrounding tenant log (SUCCESS_LOGIN,
  // SUCCESS_EXCHANGE_*, …) can embed `details.execution_id`. Matches Auth0:
  // execution IDs are discovered via tenant logs, then fetched with
  // GET /api/v2/actions/executions/:id.
  action_execution_id?: string;
  // Set by `attemptUpstreamPasswordFallback` around its `users.create` call so
  // the signup gates (preUserSignupHook / validateSignupEmail) treat the
  // creation as a migration import rather than a fresh signup. Without this,
  // a connection that has both `disable_signup: true` and `import_mode: true`
  // would let users through the identifier step (correctly) only to be
  // rejected at user-creation time.
  is_lazy_migration?: boolean;
};
