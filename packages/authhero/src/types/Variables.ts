import { LoginSession } from "@authhero/adapter-interfaces";

export type Variables = {
  tenant_id: string;
  ip: string;
  client_id?: string;
  user_id?: string;
  username?: string;
  connection?: string;
  body?: any;
  log?: string;
  // This is set by auth middleware
  user?: { sub: string; tenant_id: string };
  // This is used by the hooks
  loginSession?: LoginSession;
};
