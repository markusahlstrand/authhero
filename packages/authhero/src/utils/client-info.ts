import { HonoRequest } from "hono";
import { CountryCode } from "libphonenumber-js";

/**
 * Return information about the request
 * @param req
 * @returns
 */
export function getClientInfo(req: HonoRequest): {
  auth0Client?: string;
  ip?: string;
  useragent?: string;
  countryCode?: CountryCode;
} {
  return {
    auth0Client: req.query("auth0Client")?.slice(0, 255),
    ip: req.header("x-real-ip")?.slice(0, 45),
    useragent: req.header("user-agent")?.slice(0, 512),
    countryCode: req.header("cf-ipcountry")?.slice(0, 2) as CountryCode,
  };
}
