import { CountryCode } from "libphonenumber-js";
import { Variables } from "../types/Variables";
import { Context } from "hono";

/**
 * Get client information from Hono context (when using clientInfoMiddleware)
 * @param c - Hono context
 * @returns Client information object
 */
export function getClientInfoFromContext(
  c: Context<{ Variables: Variables }>,
): {
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
  ip?: string;
  useragent?: string;
  countryCode?: CountryCode;
} {
  return {
    auth0_client: c.get("auth0_client"),
    ip: c.get("ip"),
    useragent: c.get("useragent"),
    countryCode: c.get("countryCode"),
  };
}

/**
 * Convert structured auth0_client object back to string format for storage
 * @param auth0_client - Structured auth0 client object
 * @returns String representation of auth0 client
 */
export function stringifyAuth0Client(auth0_client?: {
  name: string;
  version: string;
  env?:
    | {
        node?: string | undefined;
      }
    | undefined;
}): string | undefined {
  if (!auth0_client) return undefined;

  return `${auth0_client.name}/${auth0_client.version}${
    auth0_client.env?.node ? ` (env: node/${auth0_client.env.node})` : ""
  }`;
}

/**
 * Get client information from context with auth0Client as string (for backward compatibility)
 * @param c - Hono context
 * @returns Client information object with stringified auth0Client
 */
export function getClientInfoWithStringAuth0Client(
  c: Context<{ Variables: Variables }>,
): {
  auth0Client?: string;
  ip?: string;
  useragent?: string;
  countryCode?: CountryCode;
} {
  return {
    auth0Client: stringifyAuth0Client(c.get("auth0_client")),
    ip: c.get("ip"),
    useragent: c.get("useragent"),
    countryCode: c.get("countryCode"),
  };
}
