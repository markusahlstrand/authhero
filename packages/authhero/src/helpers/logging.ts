import { Context } from "hono";
import {
  LogInsert,
  LogType,
  AuditEventInsert,
  AuditCategory,
} from "@authhero/adapter-interfaces";
import { Variables, Bindings } from "../types";
import { waitUntil } from "./wait-until";
import { instanceToJson } from "../utils/instance-to-json";

/** Fields to strip from before/after entity state */
const SENSITIVE_FIELDS = new Set([
  "password",
  "password_hash",
  "client_secret",
  "signing_keys",
  "credentials",
  "encryption_key",
  "otp_secret",
]);

function redactSensitiveFields(
  obj: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = value;
    }
  }
  return result;
}

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
   * When provided, replaces the auto-generated details object entirely.
   * Use this to store a compact, pre-built details payload (e.g. for webhook logs)
   * that fits within storage limits (Analytics Engine blob: 1024 bytes).
   */
  details?: Record<string, unknown>;
  /**
   * If true, wait for the log to complete before returning.
   * If false (default), execute logging asynchronously in the background.
   * @default false
   */
  waitForCompletion?: boolean;
  /** Entity state before the mutation (for audit events) */
  beforeState?: Record<string, unknown>;
  /** Entity state after the mutation (for audit events) */
  afterState?: Record<string, unknown>;
  /** Entity type being mutated (e.g. 'user', 'client', 'connection') */
  targetType?: string;
  /** Entity ID being mutated */
  targetId?: string;
};

function computeDiff(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): Record<string, { old: unknown; new: unknown }> | undefined {
  if (!before || !after) return undefined;
  const diff: Record<string, { old: unknown; new: unknown }> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    const oldVal = before[key];
    const newVal = after[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { old: oldVal, new: newVal };
    }
  }
  return Object.keys(diff).length > 0 ? diff : undefined;
}

function inferCategory(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
): AuditCategory {
  // If there's a user_id in context, it's likely an admin action via management API
  if (ctx.var.user_id) return "admin_action";
  // Client credentials flow
  if (ctx.var.client_id && !ctx.var.user_id) return "api";
  return "system";
}

function buildAuditEvent(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  params: LogParams,
): AuditEventInsert {
  const beforeState = redactSensitiveFields(params.beforeState);
  const afterState = redactSensitiveFields(params.afterState);

  return {
    tenant_id: tenantId,
    event_type: params.targetType
      ? `${params.targetType}.${inferOperationType(ctx.req.method)}`
      : params.type,
    log_type: params.type,
    description: params.description,
    category: inferCategory(ctx),

    actor: {
      type: ctx.var.user_id
        ? "admin"
        : ctx.var.client_id
          ? "client_credentials"
          : "system",
      id: ctx.var.user_id || undefined,
      email: ctx.var.username || undefined,
      org_id: ctx.var.organization_id || ctx.var.user?.org_id || undefined,
      org_name: ctx.var.org_name || ctx.var.user?.org_name || undefined,
      scopes: ctx.var.user?.scope ? ctx.var.user.scope.split(" ") : undefined,
      client_id: ctx.var.client_id || undefined,
    },

    target: {
      type: params.targetType || "unknown",
      id: params.targetId || params.userId || ctx.var.user_id || "",
      before: beforeState,
      after: afterState,
      diff: computeDiff(beforeState, afterState),
    },

    request: {
      method: ctx.req.method,
      path: ctx.req.path,
      query: ctx.req.queries()
        ? Object.fromEntries(
            Object.entries(ctx.req.queries()).map(([k, v]) => [
              k,
              Array.isArray(v) ? v.join(",") : v,
            ]),
          )
        : undefined,
      body: params.body || ctx.var.body || undefined,
      ip: ctx.var.ip || "",
      user_agent: ctx.var.useragent || undefined,
    },

    response: params.response
      ? {
          status_code: params.response.statusCode,
          body: params.response.body,
        }
      : undefined,

    connection: params.connection || ctx.var.connection || undefined,
    strategy: params.strategy || undefined,
    strategy_type: params.strategy_type || undefined,

    hostname: ctx.var.host || "",
    is_mobile: false,
    auth0_client: ctx.var.auth0_client,
    timestamp: new Date().toISOString(),
  };
}

function inferOperationType(method: string): string {
  switch (method) {
    case "POST":
      return "created";
    case "PATCH":
    case "PUT":
      return "updated";
    case "DELETE":
      return "deleted";
    default:
      return "accessed";
  }
}

export async function logMessage(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  params: LogParams,
): Promise<void> {
  // Outbox path: write rich AuditEvent to outbox (synchronously, within transaction)
  if (ctx.env.outbox?.enabled && ctx.env.data.outbox) {
    const event = buildAuditEvent(ctx, tenantId, params);
    await ctx.env.data.outbox.create(tenantId, event);
    return;
  }

  // Legacy path: build LogInsert and fire-and-forget
  // Extract headers synchronously before any async operations
  // Must create a plain object copy because the Headers object may not be
  // accessible after the request context closes (e.g., in waitUntil)
  // Lowercase all keys for consistent access
  const headers: Record<string, string> = {};
  if (ctx.req.raw?.headers) {
    const rawHeaders = instanceToJson(ctx.req.raw.headers);
    for (const [key, value] of Object.entries(rawHeaders)) {
      headers[key.toLowerCase()] = value;
    }
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
      details: params.details || {
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
      hostname: ctx.var.host || "",
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
