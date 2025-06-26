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
  // This is set by auth middleware
  user?: { sub: string; tenant_id: string };
  // This is used by the hooks
  loginSession?: LoginSession;
  // Client info from middleware
  auth0_client?: Auth0Client;
  useragent?: string;
  countryCode?: CountryCode;
};
