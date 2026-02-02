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
  authParams: AuthParams;
  organization?: { id: string; name: string };
  impersonatingUser?: User; // The original user who is impersonating (RFC 8693)
  // OIDC Core 2.1: auth_time is required when max_age was used in authorization request
  auth_time?: number; // Unix timestamp of when the user was authenticated
}

export interface GrantFlowUserResult extends GrantFlowResult {
  user: User;
}
