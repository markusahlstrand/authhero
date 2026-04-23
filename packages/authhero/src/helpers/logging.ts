import { Context } from "hono";
import {
  DataAdapters,
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

/** Redact sensitive fields if the value is a plain object, otherwise return as-is */
function redactBody(body: unknown): unknown {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return redactSensitiveFields(body as Record<string, unknown>);
  }
  return body;
}

export type LogParams = {
  type: LogType;
  description?: string;
  userId?: string;
  /**
   * Identifier of the actor when it differs from the subject `userId`
   * (e.g. impersonation). When set, audit events attribute `actor.id` to
   * this value and `target.id` to `userId`, and the event is categorised as
   * `admin_action`.
   */
  actorUserId?: string;
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
  params: LogParams,
): AuditCategory {
  // Admin action via management API (ctx.var.user_id is the admin)
  if (ctx.var.user_id) return "admin_action";
  // Admin-like action outside the management API (e.g. impersonation) where
  // the actor differs from the subject user
  if (params.actorUserId) return "admin_action";
  // User-initiated action (login, signup, password change) — params.userId identifies the acting user
  if (params.userId) return "user_action";
  // Client credentials flow
  if (ctx.var.client_id) return "api";
  return "system";
}

function buildAuditEvent(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  params: LogParams,
): AuditEventInsert {
  const captureEntityState = ctx.env.outbox?.captureEntityState !== false;
  const beforeState = captureEntityState
    ? redactSensitiveFields(params.beforeState)
    : undefined;
  const afterState = captureEntityState
    ? redactSensitiveFields(params.afterState)
    : undefined;

  return {
    tenant_id: tenantId,
    event_type: params.targetType
      ? `${params.targetType}.${inferOperationType(ctx.req.method)}`
      : params.type,
    log_type: params.type,
    description: params.description,
    category: inferCategory(ctx, params),

    actor: {
      type:
        ctx.var.user_id || params.actorUserId
          ? "admin"
          : params.userId
            ? "user"
            : ctx.var.client_id
              ? "client_credentials"
              : "system",
      id:
        ctx.var.user_id || params.actorUserId || params.userId || undefined,
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
      body: redactBody(params.body || ctx.var.body || undefined),
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
    audience: params.audience || undefined,
    scope: params.scope || undefined,

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

  // Outbox path: write rich AuditEvent to outbox (synchronously, within transaction)
  if (ctx.env.outbox?.enabled && ctx.env.data.outbox) {
    const event = buildAuditEvent(ctx, tenantId, params);

    // Geo enrichment is deferred to the outbox relay/processor.
    // The IP is already captured in event.request.ip.
    const eventPromise = ctx.env.data.outbox.create(tenantId, event);

    // Push the promise synchronously so even non-awaited logMessage calls
    // are captured by the outbox middleware's finally block.
    const existingPromises = ctx.var.outboxEventPromises || [];
    existingPromises.push(eventPromise);
    ctx.set("outboxEventPromises", existingPromises);
    return;
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
          body: redactBody(params.body || ctx.var.body || ""),
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

/**
 * Transactional variant of {@link logMessage}. Writes the audit event to the
 * outbox through the caller-provided `trxData` so the insert commits (or rolls
 * back) with the surrounding business write. Returns the event id so the
 * caller can hand it to the outbox middleware for destination delivery.
 *
 * Only intended for outbox-enabled deployments; callers should fall back to
 * `logMessage` when `ctx.env.outbox?.enabled` is false.
 */
export async function logMessageInTx(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  trxData: DataAdapters,
  tenantId: string,
  params: LogParams,
): Promise<string | undefined> {
  if (!ctx.env.outbox?.enabled || !trxData.outbox) return undefined;
  const event = buildAuditEvent(ctx, tenantId, params);
  return trxData.outbox.create(tenantId, event);
}
