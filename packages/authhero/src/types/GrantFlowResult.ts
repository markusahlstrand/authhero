import type {
  User,
  AuthParams,
  LoginSession,
} from "@authhero/adapter-interfaces";
import type { EnrichedClient } from "../helpers/client";

export interface GrantFlowResult {
  user?: User;
  client: EnrichedClient;
  refresh_token?: string;
  loginSession?: LoginSession;
  session_id?: string;
  login_id?: string;
  authParams: AuthParams;
  organization?: { id: string; name: string };
  impersonatingUser?: User; // The original user who is impersonating (RFC 8693)
  /**
   * RFC 8693 §4.1 — client acting on behalf of the user via a delegated flow
   * (e.g. token-exchange). Carries through to the access token's `act` claim
   * as `{ sub: client_id, client_id }`.
   */
  actClient?: { client_id: string };
  // OIDC Core 2.1: auth_time is required when max_age was used in authorization request
  auth_time?: number; // Unix timestamp of when the user was authenticated
  /** The connection name used for authentication (e.g., "email", "google-oauth2") */
  authConnection?: string;
}

export interface GrantFlowUserResult extends GrantFlowResult {
  user: User;
}
