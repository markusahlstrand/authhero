import { MiddlewareHandler } from "hono";
import { CountryCode } from "libphonenumber-js";
import { Variables } from "../types/Variables";
import { auth0ClientSchema } from "../types/Auth0Client";

/**
 * Parse auth0Client string into structured object
 * Supports both JSON format and string format like "name/version (env: node/version)"
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
  if (!auth0ClientString) {
    return undefined;
  }

  try {
    // Handle base64 encoded clients
    let decodedString = auth0ClientString;
    try {
      decodedString = atob(auth0ClientString);
    } catch {
      // If not base64, use as is
    }

    // First, try to parse as JSON
    try {
      const parsed = JSON.parse(decodedString);
      const validated = auth0ClientSchema.parse(parsed);
      return validated;
    } catch {
      // If JSON parsing fails, fall back to string parsing
    }
  } catch (error) {
    return undefined;
  }
}

/**
 * Middleware that extracts client information from the request and stores it in context variables
 */
export const clientInfoMiddleware: MiddlewareHandler<{
  Variables: Variables;
}> = async (c, next) => {
  // Extract client information using the same logic as getClientInfo
  const auth0ClientString = c.req.query("auth0Client")?.slice(0, 255);
  const ip = (
    c.req.header("cf-connecting-ip") || c.req.header("x-real-ip")
  )?.slice(0, 45);
  const useragent = c.req.header("user-agent")?.slice(0, 512);
  const countryCode = c.req.header("cf-ipcountry")?.slice(0, 2) as CountryCode;

  // Parse auth0Client into structured object
  const auth0Client = auth0ClientString
    ? parseAuth0Client(auth0ClientString)
    : undefined;

  // Store in context variables
  if (auth0Client) {
    c.set("auth0_client", auth0Client);
  }
  if (ip) {
    c.set("ip", ip);
  }
  if (useragent) {
    c.set("useragent", useragent);
  }
  if (countryCode) {
    c.set("countryCode", countryCode);
  }

  await next();
};
