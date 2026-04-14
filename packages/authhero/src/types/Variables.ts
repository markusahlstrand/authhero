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
};
