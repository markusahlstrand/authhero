import { Context, MiddlewareHandler } from "hono";
import { isCloudflareIp } from "@authhero/proxy";
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
 * Derive the client IP from the least forgeable header available.
 *
 * `X-Forwarded-For` arrives carrying whatever prefix the caller chose to send:
 * `@authhero/proxy` appends the hop it verified to the end of the inbound
 * chain and leaves the rest intact, so the leading entries are the client's
 * own claim. Reading the first one handed a caller full control of
 * `ctx.var.ip`, which keys the pre-login rate limiter (and its allowlist) and
 * the passwordless IP check. Order of trust instead:
 *
 * 1. `CF-Connecting-IP`, unless it holds one of Cloudflare's own addresses.
 *    The edge overwrites it on ingress, so on a direct hit it is
 *    authoritative. When a Worker is reached worker-to-worker — our proxy's
 *    service binding to this app — the runtime replaces it with the loopback
 *    source, which is why a Cloudflare-owned value falls through instead of
 *    being laundered as a visitor.
 * 2. `X-Real-IP`, which `@authhero/proxy` overwrites with the hop it verified.
 *    Only reachable when (1) is absent or Cloudflare-owned — off the edge, or
 *    behind our own proxy — so a caller on the edge cannot reach this branch
 *    by sending the header itself.
 * 3. The *last* `X-Forwarded-For` entry: the hop appended by the nearest
 *    proxy, rather than the first, which anyone can set.
 */
export function getClientIp(
  c: Context<{ Variables: Variables }>,
): string | undefined {
  const cfConnectingIp = c.req.header("cf-connecting-ip")?.trim();
  if (cfConnectingIp && !isCloudflareIp(cfConnectingIp)) {
    return cfConnectingIp;
  }

  const realIp = c.req.header("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const hops = (c.req.header("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);

  return hops[hops.length - 1];
}

/**
 * Middleware that extracts client information from the request and stores it in context variables
 */
export const clientInfoMiddleware: MiddlewareHandler<{
  Variables: Variables;
}> = async (c, next) => {
  // Extract client information using the same logic as getClientInfo
  const auth0ClientString = c.req.query("auth0Client")?.slice(0, 255);

  const ip = getClientIp(c)?.slice(0, 45);
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
