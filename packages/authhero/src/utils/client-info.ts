import { HonoRequest } from "hono";
import { CountryCode } from "libphonenumber-js";
import { Variables } from "../types/Variables";
import { Context } from "hono";

/**
 * Parse auth0Client string into structured object
 * Expected format: "name/version" or "name/version (env: node/version)"
 */
function parseAuth0Client(auth0ClientString: string):
  | {
      name: string;
      version: string;
      env?:
        | {
            node?: string | undefined;
          }
        | undefined;
    }
  | undefined {
  if (!auth0ClientString) return undefined;

  try {
    // Handle base64 encoded clients
    let decodedString = auth0ClientString;
    try {
      decodedString = atob(auth0ClientString);
    } catch {
      // If not base64, use as is
    }

    // Parse format like "auth0-spa-js/1.13.6" or "auth0-spa-js/1.13.6 (env: node/16.14.0)"
    const mainMatch = decodedString.match(/^([^\/]+)\/([^\s\(]+)/);
    if (!mainMatch || !mainMatch[1] || !mainMatch[2]) return undefined;

    const name = mainMatch[1];
    const version = mainMatch[2];

    // Check for environment info
    const envMatch = decodedString.match(/\(env:\s*node\/([^\)]+)\)/);
    const nodeVersion = envMatch ? envMatch[1] : undefined;

    return {
      name,
      version,
      env: nodeVersion ? { node: nodeVersion } : undefined,
    };
  } catch (error) {
    return undefined;
  }
}

/**
 * Return information about the request
 * @param req - Hono request object
 * @param vars - Optional context variables (if using clientInfoMiddleware)
 * @returns Client information object
 */
export function getClientInfo(
  req: HonoRequest,
  vars?: Variables,
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
  // If context variables are available (from middleware), use them
  if (vars) {
    return {
      auth0_client: vars.auth0_client,
      ip: vars.ip,
      useragent: vars.useragent,
      countryCode: vars.countryCode,
    };
  }

  // Otherwise, extract directly from request headers/query
  const auth0ClientString = req.query("auth0Client")?.slice(0, 255);
  return {
    auth0_client: auth0ClientString
      ? parseAuth0Client(auth0ClientString)
      : undefined,
    ip: req.header("x-real-ip")?.slice(0, 45),
    useragent: req.header("user-agent")?.slice(0, 512),
    countryCode: req.header("cf-ipcountry")?.slice(0, 2) as CountryCode,
  };
}

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
