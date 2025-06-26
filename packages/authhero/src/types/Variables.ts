import { LoginSession } from "@authhero/adapter-interfaces";
import { CountryCode } from "libphonenumber-js";

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
  auth0_client?:
    | {
        name: string;
        version: string;
        env?:
          | {
              node?: string | undefined;
            }
          | undefined;
      }
    | undefined;
  useragent?: string;
  countryCode?: CountryCode;
};
