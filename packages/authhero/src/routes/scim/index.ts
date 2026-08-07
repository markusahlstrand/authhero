import { OpenAPIHono } from "@hono/zod-openapi";
import { Context } from "hono";
import {
  LogTypes,
  Connection,
  ScimConfiguration,
  User,
  DataAdapters,
} from "@authhero/adapter-interfaces";
import { AuthHeroConfig, Bindings, Variables } from "../../types";
import { applyConfigMiddleware } from "../../middlewares/apply-config";
import { tenantMiddleware } from "../../middlewares/tenant";
import { clientInfoMiddleware } from "../../middlewares/client-info";
import { outboxMiddleware } from "../../middlewares/outbox";
import { LogsDestination } from "../../helpers/outbox-destinations/logs";
import { LogStreamDestination } from "../../helpers/outbox-destinations/log-streams";
import { serverTimingMiddleware } from "../../helpers/server-timing";
import { composeAuthData } from "../../helpers/compose-auth-data";
import { createInMemoryCache } from "../../adapters/cache/in-memory";
import { scimAuthMiddleware } from "../../middlewares/scim-auth";
import { logMessage } from "../../helpers/logging";
import { userIdGenerate } from "../../utils/user-id";
import { revokeUserSessions } from "../../helpers/revoke-user-sessions";
import {
  ScimError,
  SCIM_CONTENT_TYPE,
  scimErrorBody,
  scimListResponse,
} from "../../helpers/scim/responses";
import {
  parseScimFilter,
  evaluateScimFilter,
  asSingleEquality,
  UnsupportedFilterError,
} from "../../helpers/scim/filter";
import { applyScimPatch } from "../../helpers/scim/patch";
import {
  userToScimResource,
  scimResourceToUserFields,
  userToFilterAttributes,
  ScimUserResource,
} from "../../helpers/scim/user-mapping";
import {
  serviceProviderConfig,
  resourceTypes,
  schemas,
  SCIM_MAX_RESULTS,
} from "../../helpers/scim/discovery";

const MAX_LIST_SCAN = 1000;
const DEFAULT_COUNT = 100;
const EXTERNAL_ID_BATCH = 50;

// `q` values are Lucene-ish: spaces split tokens, ` OR ` is split out before
// quoting is even considered, and a `"` unbalances quoting. A value carrying
// any of those cannot be embedded in a `q` string without changing its
// meaning, so it takes the in-memory path instead.
const Q_SAFE_VALUE = /^[^\s"]+$/;

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

interface ScimContext {
  tenant_id: string;
  connection_id: string;
  connection: Connection;
  configuration: ScimConfiguration;
  data: DataAdapters & {
    scimExternalIds: NonNullable<DataAdapters["scimExternalIds"]>;
  };
  baseUrl: string;
}

async function resolveScim(ctx: Ctx): Promise<ScimContext> {
  const tenant_id = ctx.var.tenant_id!;
  const connection_id = ctx.req.param("connection_id")!;
  const data = ctx.env.data;
  if (!data.scimConfigurations || !data.scimExternalIds) {
    throw new ScimError(501, "SCIM is not supported by this deployment");
  }
  const connection = await data.connections.get(tenant_id, connection_id);
  if (!connection) {
    throw new ScimError(404, "Connection not found");
  }
  const configuration = await data.scimConfigurations.get(
    tenant_id,
    connection_id,
  );
  if (!configuration) {
    throw new ScimError(404, "SCIM is not configured for this connection");
  }
  const origin = new URL(ctx.req.url).origin;
  return {
    tenant_id,
    connection_id,
    connection,
    configuration,
    data: data as ScimContext["data"],
    baseUrl: `${origin}/scim/v2/connections/${connection_id}`,
  };
}

// ServiceProviderConfig advertises `filter.maxResults`, so honour it: a larger
// requested count is clamped rather than served.
function clampCount(requested: number): number {
  return Math.min(SCIM_MAX_RESULTS, Math.max(0, requested));
}

function scimJson(
  ctx: Ctx,
  body: unknown,
  status: 200 | 201,
  location?: string,
): Response {
  const headers: Record<string, string> = {
    "content-type": SCIM_CONTENT_TYPE,
  };
  if (location) headers.location = location;
  return ctx.body(JSON.stringify(body), status, headers);
}

async function externalIdFor(
  s: ScimContext,
  user_id: string,
): Promise<string | undefined> {
  const mapping = await s.data.scimExternalIds.getByUserId(
    s.tenant_id,
    s.connection_id,
    user_id,
  );
  return mapping?.external_id;
}

/**
 * externalIds for a batch of users. The adapter has no bulk lookup, so resolve
 * them concurrently in bounded batches rather than one sequential round trip
 * per user (a filter scan otherwise costs one query per scanned user).
 */
async function externalIdsFor(
  s: ScimContext,
  users: User[],
): Promise<Map<string, string | undefined>> {
  const byUserId = new Map<string, string | undefined>();
  for (let i = 0; i < users.length; i += EXTERNAL_ID_BATCH) {
    const batch = users.slice(i, i + EXTERNAL_ID_BATCH);
    const resolved = await Promise.all(
      batch.map((user) => externalIdFor(s, user.user_id)),
    );
    batch.forEach((user, idx) => byUserId.set(user.user_id, resolved[idx]));
  }
  return byUserId;
}

function toResourceWith(
  s: ScimContext,
  user: User,
  externalId: string | undefined,
): ScimUserResource {
  return userToScimResource(
    user,
    externalId,
    `${s.baseUrl}/Users/${user.user_id}`,
  );
}

async function toResource(
  s: ScimContext,
  user: User,
): Promise<ScimUserResource> {
  return toResourceWith(s, user, await externalIdFor(s, user.user_id));
}

async function toResources(
  s: ScimContext,
  users: User[],
): Promise<ScimUserResource[]> {
  const externalIds = await externalIdsFor(s, users);
  return users.map((user) =>
    toResourceWith(s, user, externalIds.get(user.user_id)),
  );
}

// A user only belongs to this SCIM connection if its connection matches.
function inConnection(s: ScimContext, user: User | null): user is User {
  return !!user && user.connection === s.connection.name;
}

async function loadUserInConnection(
  s: ScimContext,
  user_id: string,
): Promise<User | null> {
  const user = await s.data.users.get(s.tenant_id, user_id);
  return inConnection(s, user) ? user : null;
}

/**
 * Resolve a SCIM `userName` to a user of this connection. The targeted `q`
 * lookup is only usable for values that can't rewrite the query grammar (see
 * `Q_SAFE_VALUE`); anything else falls back to the in-memory scan, which never
 * interpolates the value at all. Either way the result is re-checked against
 * the connection, so a user of another connection can never be returned.
 */
async function findByUserName(
  s: ScimContext,
  userName: string,
): Promise<User | null> {
  const field = userName.includes("@") ? "email" : "username";

  let candidates: User[];
  if (Q_SAFE_VALUE.test(userName)) {
    const { users } = await s.data.users.list(s.tenant_id, {
      page: 0,
      per_page: 5,
      include_totals: false,
      q: `${field}:${userName} connection:${s.connection.name}`,
    });
    candidates = users;
  } else {
    const wanted = userName.toLowerCase();
    const { users } = await listConnectionUsers(s);
    candidates = users.filter(
      (u) => (u.email ?? u.username ?? "").toLowerCase() === wanted,
    );
  }

  const inThisConnection = candidates.filter((u) => inConnection(s, u));
  return (
    inThisConnection.find((u) => !u.linked_to) ?? inThisConnection[0] ?? null
  );
}

async function findByExternalId(
  s: ScimContext,
  externalId: string,
): Promise<User | null> {
  const mapping = await s.data.scimExternalIds.getByExternalId(
    s.tenant_id,
    s.connection_id,
    externalId,
  );
  if (!mapping) return null;
  return loadUserInConnection(s, mapping.user_id);
}

/**
 * The matching-row count of a `users.list({ include_totals: true })` call. Both
 * adapters report it in `length` (`total` is left unset), so read it from there
 * and fall back to the page size if an adapter omits it.
 */
function totalFrom(result: { users: User[]; length?: number }): number {
  return typeof result.length === "number"
    ? result.length
    : result.users.length;
}

interface ConnectionUsers {
  users: User[];
  /** The adapter's own count of the connection's users, never the scan size. */
  total: number;
  /** True when the connection holds more users than the scan collected. */
  truncated: boolean;
}

/**
 * Scan up to `MAX_LIST_SCAN` users of the connection, together with the
 * adapter's real total. The total comes from the count query rather than the
 * collected page, so a truncated scan is visible to the caller instead of
 * silently reporting the cap as the whole population.
 */
async function listConnectionUsers(s: ScimContext): Promise<ConnectionUsers> {
  const collected: User[] = [];
  let page = 0;
  let total = 0;
  const perPage = 100;
  while (collected.length < MAX_LIST_SCAN) {
    const result = await s.data.users.list(s.tenant_id, {
      page,
      per_page: perPage,
      include_totals: true,
      q: `connection:${s.connection.name}`,
    });
    if (page === 0) total = totalFrom(result);
    collected.push(...result.users.filter((u) => !u.linked_to));
    if (result.users.length < perPage) break;
    page++;
  }
  return { users: collected, total, truncated: total > collected.length };
}

/**
 * A single page of the connection's users, resolved by the adapter rather than
 * by scanning. `startIndex`/`count` are the SCIM window; when it aligns to a
 * page boundary (how every IdP pages) the offset goes straight to the DB, so
 * deep pagination costs nothing extra. An unaligned window is served by
 * over-fetching from the start, which is bounded by `MAX_LIST_SCAN`.
 */
async function pageConnectionUsers(
  s: ScimContext,
  offset: number,
  count: number,
): Promise<{ users: User[]; total: number }> {
  const aligned = count > 0 && offset % count === 0;
  if (!aligned && offset + count > MAX_LIST_SCAN) {
    throw new ScimError(
      400,
      `startIndex is beyond the supported window (${MAX_LIST_SCAN}) for this count; page with a count that divides startIndex - 1`,
      "invalidValue",
    );
  }

  const per_page = aligned ? count : offset + count;
  const result = await s.data.users.list(s.tenant_id, {
    page: aligned && count > 0 ? offset / count : 0,
    per_page,
    include_totals: true,
    q: `connection:${s.connection.name}`,
  });
  const users = result.users.filter((u) => !u.linked_to);
  return {
    users: aligned ? users : users.slice(offset),
    total: totalFrom(result),
  };
}

// ---------------------------------------------------------------------------
// Query (shared by GET /Users and POST /Users/.search)
// ---------------------------------------------------------------------------

async function queryUsers(
  s: ScimContext,
  filter: string | undefined,
  startIndex: number,
  count: number,
): Promise<{ resources: ScimUserResource[]; total: number }> {
  // Targeted lookups for the single-eq filters IdPs send before create.
  if (filter) {
    let ast;
    try {
      ast = parseScimFilter(filter);
    } catch (err) {
      if (err instanceof UnsupportedFilterError) {
        throw new ScimError(501, err.message, "invalidFilter");
      }
      throw new ScimError(400, (err as Error).message, "invalidFilter");
    }

    const single = asSingleEquality(ast);
    if (single && typeof single.value === "string") {
      const attr = single.attribute.toLowerCase();
      let match: User | null = null;
      if (attr === "username") match = await findByUserName(s, single.value);
      else if (attr === "externalid")
        match = await findByExternalId(s, single.value);
      if (attr === "username" || attr === "externalid") {
        const resources = match ? [await toResource(s, match)] : [];
        return { resources, total: resources.length };
      }
    }

    // General case: scan the connection and evaluate in memory. That can only
    // answer honestly if the scan covered every user — a filter evaluated over
    // a truncated scan would report matches past the cap as absent, which for
    // a provisioning client means "create a duplicate". Say so instead.
    const scan = await listConnectionUsers(s);
    if (scan.truncated) {
      throw new ScimError(
        400,
        `This filter is evaluated over the connection's users and it holds more than ${MAX_LIST_SCAN}; narrow the filter to userName or externalId`,
        "tooMany",
      );
    }

    const externalIds = await externalIdsFor(s, scan.users);
    const matched = scan.users.filter((user) =>
      evaluateScimFilter(
        ast,
        userToFilterAttributes(user, externalIds.get(user.user_id)),
      ),
    );
    const pageSlice = matched.slice(startIndex - 1, startIndex - 1 + count);
    const resources = pageSlice.map((user) =>
      toResourceWith(s, user, externalIds.get(user.user_id)),
    );
    return { resources, total: matched.length };
  }

  const { users, total } = await pageConnectionUsers(s, startIndex - 1, count);
  return { resources: await toResources(s, users), total };
}

// ---------------------------------------------------------------------------
// Create / replace / patch shared write helpers
// ---------------------------------------------------------------------------

async function upsertExternalId(
  s: ScimContext,
  user_id: string,
  externalId: string | undefined,
): Promise<void> {
  if (!externalId) return;
  const existing = await s.data.scimExternalIds.getByUserId(
    s.tenant_id,
    s.connection_id,
    user_id,
  );
  if (existing && existing.external_id === externalId) return;

  // externalId is unique per connection, so a value already claimed by another
  // user is a SCIM uniqueness conflict, not a 500 out of the unique index.
  const claimed = await s.data.scimExternalIds.getByExternalId(
    s.tenant_id,
    s.connection_id,
    externalId,
  );
  if (claimed && claimed.user_id !== user_id) {
    throw new ScimError(
      409,
      "A user with this externalId already exists",
      "uniqueness",
    );
  }

  if (existing) {
    // externalId is immutable in practice; replace by remove+create.
    await s.data.scimExternalIds.remove(s.tenant_id, s.connection_id, user_id);
  }
  try {
    await s.data.scimExternalIds.create(s.tenant_id, {
      connection_id: s.connection_id,
      external_id: externalId,
      user_id,
    });
  } catch (err) {
    // Lost a race on the unique index. Put the previous mapping back so the
    // user doesn't end up with no externalId at all, then report the conflict.
    if (existing) {
      await s.data.scimExternalIds
        .create(s.tenant_id, {
          connection_id: s.connection_id,
          external_id: existing.external_id,
          user_id,
        })
        .catch(() => undefined);
    }
    console.error("SCIM externalId mapping failed:", err);
    throw new ScimError(
      409,
      "A user with this externalId already exists",
      "uniqueness",
    );
  }
}

function logScim(
  ctx: Ctx,
  s: ScimContext,
  description: string,
  user_id?: string,
): void {
  logMessage(ctx, s.tenant_id, {
    type: LogTypes.SUCCESSFUL_SCIM_OPERATION,
    description,
    connection: s.connection.name,
    connection_id: s.connection_id,
    ...(user_id
      ? { userId: user_id, targetType: "user", targetId: user_id }
      : {}),
  });
}

export function createScimApi(config: AuthHeroConfig) {
  const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

  app.onError((err, ctx) => {
    if (err instanceof ScimError) {
      return ctx.body(
        JSON.stringify(scimErrorBody(err.status, err.message, err.scimType)),
        err.status,
        { "content-type": SCIM_CONTENT_TYPE },
      );
    }
    // Anything else is a bug or an adapter failure: log the detail, but never
    // hand an internal message to the IdP.
    console.error("SCIM request failed:", err);
    return ctx.body(JSON.stringify(scimErrorBody(500, "Internal error")), 500, {
      "content-type": SCIM_CONTENT_TYPE,
    });
  });

  app.use(applyConfigMiddleware(config));
  app.use(serverTimingMiddleware);
  app.use(
    outboxMiddleware({
      getOutbox: () => config.dataAdapter.outbox,
      getDestinations: () => [
        new LogsDestination(config.dataAdapter.logs),
        ...(config.dataAdapter.logStreams
          ? [new LogStreamDestination(config.dataAdapter.logStreams)]
          : []),
      ],
    }),
  );
  app.use(async (ctx, next) => {
    const cacheAdapter =
      config.dataAdapter.cache ||
      createInMemoryCache({
        defaultTtlSeconds: 0,
        maxEntries: 100,
        cleanupIntervalMs: 0,
      });
    ctx.env.data = composeAuthData({
      ctx,
      rawData: config.dataAdapter,
      cacheAdapter,
      defaultTtl: config.dataAdapter.cache ? 300 : 0,
      nonBundleEntities: ["clients", "forms"],
    });
    return next();
  });
  app.use(clientInfoMiddleware).use(tenantMiddleware).use(scimAuthMiddleware);

  // --- Discovery ---
  app.get("/ServiceProviderConfig", async (ctx) => {
    const s = await resolveScim(ctx);
    return scimJson(
      ctx,
      serviceProviderConfig(`${s.baseUrl}/ServiceProviderConfig`),
      200,
    );
  });
  app.get("/ResourceTypes", async (ctx) => {
    const s = await resolveScim(ctx);
    return scimJson(ctx, resourceTypes(s.baseUrl), 200);
  });
  app.get("/Schemas", async (ctx) => {
    const s = await resolveScim(ctx);
    return scimJson(ctx, schemas(s.baseUrl), 200);
  });

  // --- List / search ---
  app.get("/Users", async (ctx) => {
    const s = await resolveScim(ctx);
    const startIndex = Math.max(
      1,
      parseInt(ctx.req.query("startIndex") ?? "1", 10) || 1,
    );
    const count = clampCount(
      parseInt(ctx.req.query("count") ?? String(DEFAULT_COUNT), 10) ||
        DEFAULT_COUNT,
    );
    const { resources, total } = await queryUsers(
      s,
      ctx.req.query("filter"),
      startIndex,
      count,
    );
    return scimJson(
      ctx,
      scimListResponse(resources, total, startIndex, resources.length),
      200,
    );
  });

  app.post("/Users/.search", async (ctx) => {
    const s = await resolveScim(ctx);
    const body = await ctx.req.json().catch(() => ({}));
    const startIndex = Math.max(1, Number(body.startIndex) || 1);
    const count = clampCount(
      Number(body.count ?? DEFAULT_COUNT) || DEFAULT_COUNT,
    );
    const { resources, total } = await queryUsers(
      s,
      typeof body.filter === "string" ? body.filter : undefined,
      startIndex,
      count,
    );
    return scimJson(
      ctx,
      scimListResponse(resources, total, startIndex, resources.length),
      200,
    );
  });

  // --- Get one ---
  app.get("/Users/:id", async (ctx) => {
    const s = await resolveScim(ctx);
    const user = await loadUserInConnection(s, ctx.req.param("id"));
    if (!user) throw new ScimError(404, "User not found");
    return scimJson(ctx, await toResource(s, user), 200);
  });

  // --- Create ---
  app.post("/Users", async (ctx) => {
    const s = await resolveScim(ctx);
    const body = (await ctx.req.json().catch(() => {
      throw new ScimError(400, "Invalid JSON body");
    })) as Record<string, unknown>;

    const mapped = scimResourceToUserFields(body);
    if (!mapped.email && !mapped.username) {
      throw new ScimError(400, "userName is required", "invalidValue");
    }

    // Uniqueness: userName and externalId are unique within the connection.
    if (mapped.email || mapped.username) {
      const existing = await findByUserName(
        s,
        (mapped.email ?? mapped.username)!,
      );
      if (existing) {
        throw new ScimError(
          409,
          "A user with this userName already exists",
          "uniqueness",
        );
      }
    }
    if (mapped.externalId) {
      const existing = await findByExternalId(s, mapped.externalId);
      if (existing) {
        throw new ScimError(
          409,
          "A user with this externalId already exists",
          "uniqueness",
        );
      }
    }

    const provider = s.connection.strategy;
    const user = await s.data.users.create(s.tenant_id, {
      user_id: `${provider}|${userIdGenerate()}`,
      email: mapped.email,
      username: mapped.username,
      given_name: mapped.given_name,
      family_name: mapped.family_name,
      name: mapped.name,
      blocked: mapped.blocked ?? false,
      email_verified: true,
      is_social: false,
      provider,
      connection: s.connection.name,
    });

    await upsertExternalId(s, user.user_id, mapped.externalId);
    logScim(ctx, s, "SCIM user provisioned", user.user_id);

    return scimJson(
      ctx,
      await toResource(s, user),
      201,
      `${s.baseUrl}/Users/${user.user_id}`,
    );
  });

  // --- Replace (PUT) ---
  app.put("/Users/:id", async (ctx) => {
    const s = await resolveScim(ctx);
    const user = await loadUserInConnection(s, ctx.req.param("id"));
    if (!user) throw new ScimError(404, "User not found");

    const body = (await ctx.req.json().catch(() => {
      throw new ScimError(400, "Invalid JSON body");
    })) as Record<string, unknown>;
    const { externalId, ...userFields } = scimResourceToUserFields(body);

    const willBlock = userFields.blocked === true && !user.blocked;
    await s.data.users.update(s.tenant_id, user.user_id, userFields);
    await upsertExternalId(s, user.user_id, externalId);
    if (willBlock) await revokeUserSessions(ctx, s.tenant_id, user.user_id);
    logScim(ctx, s, "SCIM user replaced", user.user_id);

    const updated = await s.data.users.get(s.tenant_id, user.user_id);
    return scimJson(ctx, await toResource(s, updated!), 200);
  });

  // --- Patch ---
  app.patch("/Users/:id", async (ctx) => {
    const s = await resolveScim(ctx);
    const user = await loadUserInConnection(s, ctx.req.param("id"));
    if (!user) throw new ScimError(404, "User not found");

    const body = (await ctx.req.json().catch(() => {
      throw new ScimError(400, "Invalid JSON body");
    })) as { Operations?: unknown };
    const operations = Array.isArray(body.Operations) ? body.Operations : [];
    if (operations.length === 0) {
      throw new ScimError(400, "PATCH requires Operations", "invalidValue");
    }

    const current = await toResource(s, user);
    let patched: Record<string, unknown>;
    try {
      patched = applyScimPatch(
        current as unknown as Record<string, unknown>,
        operations as { op: string; path?: string; value?: unknown }[],
      );
    } catch (err) {
      throw new ScimError(400, (err as Error).message, "invalidValue");
    }

    // Absent attributes are omitted by the mapper, so a PATCH that only
    // touches `active` leaves the rest of the profile alone.
    const { externalId, ...userFields } = scimResourceToUserFields(patched);
    const willBlock = userFields.blocked === true && !user.blocked;
    await s.data.users.update(s.tenant_id, user.user_id, userFields);
    await upsertExternalId(s, user.user_id, externalId);
    if (willBlock) await revokeUserSessions(ctx, s.tenant_id, user.user_id);
    logScim(ctx, s, "SCIM user patched", user.user_id);

    const updated = await s.data.users.get(s.tenant_id, user.user_id);
    return scimJson(ctx, await toResource(s, updated!), 200);
  });

  // --- Delete ---
  app.delete("/Users/:id", async (ctx) => {
    const s = await resolveScim(ctx);
    const user = await loadUserInConnection(s, ctx.req.param("id"));
    if (!user) throw new ScimError(404, "User not found");

    // Deprovisioning must end the user's access immediately, exactly as
    // deactivation does — removing the row alone would leave live sessions and
    // refresh tokens behind.
    await revokeUserSessions(ctx, s.tenant_id, user.user_id);
    await s.data.scimExternalIds.remove(
      s.tenant_id,
      s.connection_id,
      user.user_id,
    );
    await s.data.users.remove(s.tenant_id, user.user_id);
    logScim(ctx, s, "SCIM user deleted", user.user_id);

    return ctx.body(null, 204);
  });

  return app;
}
