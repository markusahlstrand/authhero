import { Context } from "hono";
import {
  DataAdapters,
  LogInsert,
  LogType,
  AuditEventInsert,
  AuditCategory,
  Strategy,
} from "@authhero/adapter-interfaces";
import { Variables, Bindings } from "../types";
import { waitUntil } from "./wait-until";
import { instanceToJson } from "../utils/instance-to-json";
import { getConnectionInfo } from "./connection";
import { USER_TARGET_TYPES } from "./audit-target-types";

/** Fields fully replaced with [REDACTED] in entity state and request bodies. */
const SENSITIVE_FIELDS = new Set([
  "password",
  "password_hash",
  "client_secret",
  "client_assertion",
  "code_verifier",
  "otp",
  "signing_keys",
  "credentials",
  "encryption_key",
  "otp_secret",
]);

/**
 * Fields masked tail-style (e.g. `******I8G`) in request bodies — matches the
 * way Auth0 surfaces authorization codes and refresh tokens in tenant logs so
 * operators can cross-reference an issued credential without exposing it.
 */
const TAIL_MASKED_FIELDS = new Set([
  "code",
  "refresh_token",
  "subject_token",
  "actor_token",
]);

function maskTail(value: string, visible = 3): string {
  if (value.length <= visible) return "*".repeat(value.length);
  return "*".repeat(value.length - visible) + value.slice(-visible);
}

function redactSensitiveFields(
  obj: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key)) {
      result[key] = "[REDACTED]";
    } else if (TAIL_MASKED_FIELDS.has(key) && typeof value === "string") {
      result[key] = maskTail(value);
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
   * Human-readable identifier for the subject user (email / phone / name).
   * Populates the legacy `user_name` field and the audit event's `actor.email`
   * when `ctx.var.username` is not set — useful for failure logs where the
   * route handler couldn't authenticate but the caller has resolved the user.
   */
  username?: string;
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
  /**
   * The id of the connection used (`con_…`). When omitted, `logMessage`
   * resolves it from the connection name via the (bundle-cached) tenant
   * connections list.
   */
  connection_id?: string;
  /**
   * Display name of the client. When omitted, `logMessage` resolves it from
   * `ctx.var.client_id`.
   */
  client_name?: string;
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

/** The affected user for the flat log's `user_id`: the target for user-scoped
 *  management operations, otherwise the subject/actor user. */
function subjectUserId(
  params: LogParams,
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
): string {
  if (
    params.targetType &&
    USER_TARGET_TYPES.has(params.targetType) &&
    params.targetId
  ) {
    return params.targetId;
  }
  return params.userId || ctx.var.user_id || "";
}

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

/**
 * Fields `logMessage` looks up when the caller didn't supply them, so every
 * log carries the same identifying data Auth0 puts on its tenant logs.
 */
type LogEnrichment = {
  connection_id: string;
  /** The resolved connection's canonical name. Differs from the requested name
   *  when it resolved case-insensitively or via the username-password fallback
   *  (e.g. the generic "Username-Password-Authentication" realm → "password"). */
  connection: string;
  client_name: string;
  user_name: string;
};

/**
 * Resolve `connection_id`, `client_name` and `user_name` from the data layer
 * when the caller didn't pass them. All reads are keyed gets or the
 * parameterless connections list, so they're served from the per-request
 * client bundle when the request warmed it. Failures degrade to empty strings
 * — enrichment must never break log delivery.
 */
async function resolveLogEnrichment(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  params: LogParams,
): Promise<LogEnrichment> {
  const connectionName = params.connection || ctx.var.connection || "";
  const clientId = ctx.var.client_id;
  // Resolve user_name for the same subject the flat log records as user_id —
  // the target for user-scoped management ops, otherwise the actor/subject.
  const subjectId = subjectUserId(params, ctx);
  const isUserTarget =
    !!params.targetType &&
    USER_TARGET_TYPES.has(params.targetType) &&
    !!params.targetId;

  const [connectionInfo, client_name, user_name] = await Promise.all([
    (async () => {
      if (!connectionName) return undefined;
      return getConnectionInfo(ctx, tenantId, connectionName);
    })(),
    (async () => {
      if (params.client_name) return params.client_name;
      if (!clientId) return "";
      try {
        const client = await ctx.env.data.clients.get(tenantId, clientId);
        return client?.name || "";
      } catch {
        return "";
      }
    })(),
    (async () => {
      // ctx.var.username / params.username identify the *actor*, so only use
      // them when the subject is the actor. For user-scoped management ops the
      // subject is the target user — resolve its name from the data layer (or
      // omit it) rather than mislabelling it with the actor's name.
      if (!isUserTarget) {
        const explicit = ctx.var.username || params.username;
        if (explicit) return explicit;
      }
      if (!subjectId) return "";
      try {
        const user = await ctx.env.data.users.get(tenantId, subjectId);
        return user?.email || user?.phone_number || user?.name || "";
      } catch {
        return "";
      }
    })(),
  ]);

  // Only correct the connection *name* when the request carried the generic
  // "Username-Password-Authentication" realm (pre-2026-07-07 sessions replay it
  // on every refresh-token exchange). Resolving it to the tenant's real
  // database connection name (e.g. "password") fixes the logged connection
  // without canonicalizing casing for every other connection.
  const connection =
    connectionName === Strategy.USERNAME_PASSWORD
      ? connectionInfo?.name || ""
      : "";

  return {
    connection_id: params.connection_id || connectionInfo?.id || "",
    connection,
    client_name,
    user_name,
  };
}

function buildAuditEvent(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  params: LogParams,
  enrichment?: LogEnrichment,
): AuditEventInsert {
  const captureEntityState = ctx.env.outbox?.captureEntityState !== false;
  const beforeState = captureEntityState
    ? redactSensitiveFields(params.beforeState)
    : undefined;
  const afterState = captureEntityState
    ? redactSensitiveFields(params.afterState)
    : undefined;

  // The enrichment's user_name was looked up for the log's subject (the target
  // for user-scoped ops, otherwise the actor/subject). Only surface it as the
  // actor's email when the subject is that same actor — never attribute a
  // target user's email to an admin actor.
  const subjectId = subjectUserId(params, ctx);
  const actorId = ctx.var.user_id || params.actorUserId || params.userId;
  const actorEmailFallback =
    enrichment && subjectId && subjectId === actorId
      ? enrichment.user_name
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
      id: ctx.var.user_id || params.actorUserId || params.userId || undefined,
      email:
        ctx.var.username || params.username || actorEmailFallback || undefined,
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

    // Prefer the resolved connection name: enrichment.connection is only set
    // when the request carried the generic username-password realm and it
    // resolved to the tenant's real database connection (e.g. "password").
    // Fall back to the raw requested name in every other case.
    connection:
      enrichment?.connection ||
      params.connection ||
      ctx.var.connection ||
      undefined,
    connection_id:
      params.connection_id || enrichment?.connection_id || undefined,
    client_name: params.client_name || enrichment?.client_name || undefined,
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
    // Geo enrichment is deferred to the outbox relay/processor.
    // The IP is already captured in event.request.ip.
    // Identity enrichment (connection_id / client_name / user_name) happens
    // inside the promise so the push below stays synchronous.
    const outbox = ctx.env.data.outbox;
    const eventPromise = (async () => {
      const enrichment = await resolveLogEnrichment(ctx, tenantId, params);
      const event = buildAuditEvent(ctx, tenantId, params, enrichment);
      return outbox.create(tenantId, event);
    })();

    // Push the promise synchronously so even non-awaited logMessage calls
    // are captured by the outbox middleware's finally block.
    const existingPromises = ctx.var.outboxEventPromises || [];
    existingPromises.push(eventPromise);
    ctx.set("outboxEventPromises", existingPromises);
    return;
  }

  const createLogPromise = async () => {
    // Get geo information if adapter is available
    const [locationInfo, enrichment] = await Promise.all([
      (async (): Promise<LogInsert["location_info"]> => {
        if (!ctx.env.data.geo) return undefined;
        try {
          return (await ctx.env.data.geo.getGeoInfo(headers)) || undefined;
        } catch (error) {
          // Silently ignore geo lookup errors
          console.warn("Failed to get geo information:", error);
          return undefined;
        }
      })(),
      resolveLogEnrichment(ctx, tenantId, params),
    ]);

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
      client_name: enrichment.client_name,
      // For user-targeted management operations (e.g. "Delete a User"), record
      // the affected user as user_id — matching Auth0 — rather than the actor.
      user_id: subjectUserId(params, ctx),
      hostname: ctx.var.host || "",
      user_name: enrichment.user_name,
      connection_id: enrichment.connection_id,
      connection:
        enrichment.connection || params.connection || ctx.var.connection || "",
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
  // Resolve identity enrichment (connection_id / client_name / user_name) the
  // same way logMessage does — otherwise connection_id and client_name are
  // silently dropped even though connection/client_id are present.
  const enrichment = await resolveLogEnrichment(ctx, tenantId, params);
  const event = buildAuditEvent(ctx, tenantId, params, enrichment);
  return trxData.outbox.create(tenantId, event);
}
