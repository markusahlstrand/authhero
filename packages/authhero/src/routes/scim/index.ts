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
} from "../../helpers/scim/discovery";

const MAX_LIST_SCAN = 1000;
const DEFAULT_COUNT = 100;

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

async function toResource(
  s: ScimContext,
  user: User,
): Promise<ScimUserResource> {
  const externalId = await externalIdFor(s, user.user_id);
  return userToScimResource(
    user,
    externalId,
    `${s.baseUrl}/Users/${user.user_id}`,
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

async function findByUserName(
  s: ScimContext,
  userName: string,
): Promise<User | null> {
  const field = userName.includes("@") ? "email" : "username";
  const { users } = await s.data.users.list(s.tenant_id, {
    page: 0,
    per_page: 5,
    include_totals: false,
    q: `${field}:${userName} connection:${s.connection.name}`,
  });
  return users.find((u) => !u.linked_to) ?? users[0] ?? null;
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

async function listConnectionUsers(s: ScimContext): Promise<User[]> {
  const collected: User[] = [];
  let page = 0;
  const perPage = 100;
  while (collected.length < MAX_LIST_SCAN) {
    const { users } = await s.data.users.list(s.tenant_id, {
      page,
      per_page: perPage,
      include_totals: false,
      q: `connection:${s.connection.name}`,
    });
    collected.push(...users.filter((u) => !u.linked_to));
    if (users.length < perPage) break;
    page++;
  }
  return collected;
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

    // General case: scan the connection and evaluate in memory.
    const users = await listConnectionUsers(s);
    const matched: User[] = [];
    for (const user of users) {
      const externalId = await externalIdFor(s, user.user_id);
      if (evaluateScimFilter(ast, userToFilterAttributes(user, externalId))) {
        matched.push(user);
      }
    }
    const pageSlice = matched.slice(startIndex - 1, startIndex - 1 + count);
    const resources = await Promise.all(pageSlice.map((u) => toResource(s, u)));
    return { resources, total: matched.length };
  }

  const users = await listConnectionUsers(s);
  const pageSlice = users.slice(startIndex - 1, startIndex - 1 + count);
  const resources = await Promise.all(pageSlice.map((u) => toResource(s, u)));
  return { resources, total: users.length };
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
  if (existing) {
    // externalId is immutable in practice; replace by remove+create.
    await s.data.scimExternalIds.remove(s.tenant_id, s.connection_id, user_id);
  }
  await s.data.scimExternalIds.create(s.tenant_id, {
    connection_id: s.connection_id,
    external_id: externalId,
    user_id,
  });
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
    ...(user_id ? { userId: user_id, targetType: "user", targetId: user_id } : {}),
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
    const detail = err instanceof Error ? err.message : "Internal error";
    return ctx.body(JSON.stringify(scimErrorBody(500, detail)), 500, {
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
    const count = Math.max(
      0,
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
    const count = Math.max(
      0,
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
    const mapped = scimResourceToUserFields(body);

    const willBlock = mapped.blocked === true && !user.blocked;
    await s.data.users.update(s.tenant_id, user.user_id, {
      email: mapped.email,
      username: mapped.username,
      given_name: mapped.given_name,
      family_name: mapped.family_name,
      name: mapped.name,
      blocked: mapped.blocked,
    });
    await upsertExternalId(s, user.user_id, mapped.externalId);
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

    const mapped = scimResourceToUserFields(patched);
    const willBlock = mapped.blocked === true && !user.blocked;
    await s.data.users.update(s.tenant_id, user.user_id, {
      email: mapped.email,
      username: mapped.username,
      given_name: mapped.given_name,
      family_name: mapped.family_name,
      name: mapped.name,
      blocked: mapped.blocked,
    });
    await upsertExternalId(s, user.user_id, mapped.externalId);
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
