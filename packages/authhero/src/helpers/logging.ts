import { Context } from "hono";
import { LogInsert, LogType } from "@authhero/adapter-interfaces";
import { Variables, Bindings } from "../types";
import { waitUntil } from "./wait-until";

export type LogParams = {
  type: LogType;
  description?: string;
  userId?: string;
  body?: unknown;
  strategy?: string;
  strategy_type?: string;
  connection?: string;
  audience?: string;
  scope?: string;
  /**
   * Response details to include in the log (for Management API operations)
   */
  response?: {
    statusCode: number;
    body?: unknown;
  };
  /**
   * If true, wait for the log to complete before returning.
   * If false (default), execute logging asynchronously in the background.
   * @default false
   */
  waitForCompletion?: boolean;
};

export async function logMessage(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  params: LogParams,
): Promise<void> {
  // Extract headers once, outside the promise, to ensure they're captured
  // before the request context might be gone
  const headers: Record<string, string> = {};
  if (ctx.req.raw?.headers) {
    ctx.req.raw.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
  }

  const createLogPromise = async () => {
    // Get geo information if adapter is available
    let locationInfo: LogInsert["location_info"] = undefined;
    if (ctx.env.data.geo) {
      try {
        const geoInfo = await ctx.env.data.geo.getGeoInfo(headers);
        locationInfo = geoInfo || undefined;
      } catch (error) {
        // Silently ignore geo lookup errors
        console.warn("Failed to get geo information:", error);
      }
    }

    const log: LogInsert = {
      type: params.type,
      description: params.description || "",
      ip: ctx.var.ip,
      user_agent: ctx.var.useragent || "",
      auth0_client: ctx.var.auth0_client,
      date: new Date().toISOString(),
      details: {
        request: {
          method: ctx.req.method,
          path: ctx.req.path,
          qs: ctx.req.queries(),
          body: params.body || ctx.var.body || "",
        },
        ...(params.response && {
          response: params.response,
        }),
      },
      isMobile: false,
      client_id: ctx.var.client_id,
      client_name: "",
      user_id: params.userId || ctx.var.user_id || "",
      hostname: ctx.req.header("host") || "",
      user_name: ctx.var.username || "",
      connection_id: "",
      connection: params.connection || ctx.var.connection || "",
      strategy: params.strategy || "",
      strategy_type: params.strategy_type || "",
      audience: params.audience || "",
      scope: params.scope || "",
      location_info: locationInfo,
    };

    // Persist the log message
    await ctx.env.data.logs.create(tenantId, log);
  };

  // If waitForCompletion is true, await the log creation
  if (params.waitForCompletion) {
    await createLogPromise();
  } else {
    // Otherwise, use waitUntil to execute in background without blocking
    waitUntil(ctx, createLogPromise());
  }
}
