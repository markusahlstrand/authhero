import type {
  User,
  LegacyClient,
  AuthParams,
  LoginSession,
} from "@authhero/adapter-interfaces";

export interface GrantFlowResult {
  user?: User;
  client: LegacyClient;
  refresh_token?: string;
  loginSession?: LoginSession;
  session_id?: string;
  authParams: AuthParams;
  organization?: { id: string; name: string };
}

export interface GrantFlowUserResult extends GrantFlowResult {
  user: User;
}
