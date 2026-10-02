import { DataAdapters, LoginSession } from "@authhero/adapter-interfaces";
import { CountryCode } from "libphonenumber-js";
import { Auth0Client } from "./Auth0Client";
import type { PreferState } from "../middlewares/prefer";
import type { EmbedLoginContext } from "../routes/universal-login/embed";

export type Variables = {
  /**
   * The adapter stack for this request. Read this, not `ctx.env.data`.
   *
   * Route groups compose a per-request stack (`composeAuthData({ ctx, ... })`)
   * that holds request-scoped state: the dedup map, the client-bundle promise
   * and hooks bound to this `ctx`. It lives here rather than on `env` because
   * Cloudflare Workers hand every request in an isolate the same `env`
   * object, so a stack stored there leaks between concurrent requests (#140).
   *
   * Typed as required because `applyConfigMiddleware`, the first middleware
   * of every route group, always sets it (to the startup adapter until a
   * route group composes its own stack). Optional would force a guard on
   * every read for a case that cannot happen behind that middleware; code
   * mounted without it has to set the variable itself. Set it through
   * `setRequestData` so the deprecated `ctx.env.data` alias stays in sync.
   */
  data: DataAdapters;
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
    aud?: string | string[];
  };
  // Organization claims from token (set by auth middleware)
  organization_id?: string;
  org_name?: string;
  // This is used by the hooks
  loginSession?: LoginSession;
  // Set by initJSXRoute when the login session runs embedded in an iframe on
  // the application's site (response_mode=web_message). Drives the
  // frame-ancestors policy and the compact page rendering.
  embedLogin?: EmbedLoginContext;
  // Client info from middleware
  auth0_client?: Auth0Client;
  useragent?: string;
  countryCode?: CountryCode;
  // Parsed RFC 7240 Prefer header tokens, populated by preferMiddleware on the
  // management API. Handlers call `applied(token)` to make the response include
  // a corresponding `Preference-Applied` header.
  prefer?: PreferState;
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
  // Per-request Server-Timing measurements accumulated by the data/cache
  // adapter wrappers and the webhook hook. Flushed once at the end of the
  // request by serverTimingMiddleware, which decides — based on the
  // SERVER_TIMING env — whether to emit them to the client, log them, or drop
  // them. See helpers/server-timing.ts.
  serverTiming?: { name: string; dur: number }[];
  // Set by `attemptUpstreamPasswordFallback` around its `users.create` call so
  // the signup gates (preUserSignupHook / validateSignupEmail) treat the
  // creation as a migration import rather than a fresh signup. Without this,
  // a connection that has both `disable_signup: true` and `import_mode: true`
  // would let users through the identifier step (correctly) only to be
  // rejected at user-creation time.
  is_lazy_migration?: boolean;
};
