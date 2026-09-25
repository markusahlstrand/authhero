import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Context } from "hono";
import {
  LogTypes,
  TokenExchangeJwtVerification,
  TokenExchangeProfile,
  tokenExchangeProfileInsertSchema,
  tokenExchangeProfileSchema,
  tokenExchangeProfileUpdateSchema,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { defineRoute } from "../../utils/define-route";
import { logMessage } from "../../helpers/logging";
import { JSONHTTPException } from "../../errors/json-http-exception";
import { requireTenantId } from "./helpers";

/**
 * Custom Token Exchange profiles (issue #1417). Mirrors Auth0's
 * `/api/v2/token-exchange-profiles`, plus AuthHero's declarative
 * `jwt_verification` alternative to `action_id`.
 */

const CUSTOM_TOKEN_EXCHANGE_TRIGGER = "custom-token-exchange";
const DEFAULT_TAKE = 50;

const listResponseSchema = z.object({
  token_exchange_profiles: z.array(tokenExchangeProfileSchema),
  next: z.string().optional(),
});

const listQuerySchema = z.object({
  from: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});

const idParamSchema = z.object({ id: z.string() });
const tenantHeaderSchema = z.object({ "tenant-id": z.string().optional() });

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

function requireProfiles(ctx: Ctx) {
  const profiles = ctx.env.data.tokenExchangeProfiles;
  if (!profiles) {
    throw new HTTPException(501, {
      message: "Token exchange profiles adapter not configured",
    });
  }
  return profiles;
}

function badRequest(message: string): never {
  throw new JSONHTTPException(400, {
    statusCode: 400,
    error: "Bad Request",
    message,
  });
}

async function assertSubjectTokenTypeFree(
  ctx: Ctx,
  tenantId: string,
  subjectTokenType: string,
  exceptId?: string,
): Promise<void> {
  const existing = await requireProfiles(ctx).list(tenantId);
  if (
    existing.some(
      (profile) =>
        profile.subject_token_type === subjectTokenType &&
        profile.id !== exceptId,
    )
  ) {
    throw new JSONHTTPException(409, {
      statusCode: 409,
      error: "Conflict",
      message: `A token exchange profile for subject_token_type '${subjectTokenType}' already exists`,
    });
  }
}

async function assertActionUsable(
  ctx: Ctx,
  tenantId: string,
  actionId: string,
): Promise<void> {
  const action = await ctx.env.data.actions.get(tenantId, actionId);
  if (!action) badRequest(`Action '${actionId}' does not exist`);
  const supportsTrigger = action.supported_triggers?.some(
    (trigger) => trigger.id === CUSTOM_TOKEN_EXCHANGE_TRIGGER,
  );
  if (!supportsTrigger) {
    badRequest(
      `Action '${actionId}' does not support the ${CUSTOM_TOKEN_EXCHANGE_TRIGGER} trigger`,
    );
  }
}

async function assertJwtVerificationUsable(
  ctx: Ctx,
  tenantId: string,
  config: TokenExchangeJwtVerification,
): Promise<void> {
  const hasJwks = config.jwks !== undefined;
  const hasJwksUri = config.jwks_uri !== undefined;
  if (hasJwks === hasJwksUri) {
    badRequest("jwt_verification needs exactly one of jwks and jwks_uri");
  }
  if (config.jwks && config.jwks.keys.length === 0) {
    badRequest("jwt_verification.jwks must contain at least one key");
  }
  if (
    config.jwks?.keys.some(
      (key) => key.kty === "oct" || key.alg?.startsWith("HS"),
    )
  ) {
    badRequest("jwt_verification.jwks must only contain public keys");
  }
  if (config.jwks_uri && !config.jwks_uri.startsWith("https://")) {
    badRequest("jwt_verification.jwks_uri must use https");
  }
  if (config.user_mapping.type === "connection") {
    const name = config.user_mapping.connection;
    const { connections } = await ctx.env.data.connections.list(tenantId);
    if (!connections.some((connection) => connection.name === name)) {
      badRequest(`Connection '${name}' does not exist`);
    }
  }
}

function auditLog(
  ctx: Ctx,
  tenantId: string,
  description: string,
  profile: TokenExchangeProfile,
) {
  return logMessage(ctx, tenantId, {
    type: LogTypes.SUCCESS_API_OPERATION,
    description,
    targetType: "token_exchange_profile",
    targetId: profile.id,
    afterState: profile,
  });
}

const listProfiles = defineRoute({
  route: createRoute({
    tags: ["token-exchange-profiles"],
    method: "get",
    path: "/",
    request: {
      query: listQuerySchema,
      headers: tenantHeaderSchema,
    },
    security: [{ Bearer: ["read:token_exchange_profiles"] }],
    responses: {
      200: {
        content: { "application/json": { schema: listResponseSchema } },
        description: "Token exchange profiles",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { from, take = DEFAULT_TAKE } = ctx.req.valid("query");
    const profiles = await requireProfiles(ctx).list(tenantId);

    // Auth0 checkpoint pagination: `from` is the id to start at and `next`
    // the id the following page starts at.
    let start = 0;
    if (from) {
      start = profiles.findIndex((profile) => profile.id === from);
      if (start === -1) {
        return ctx.json({ token_exchange_profiles: [] });
      }
    }
    const page = profiles.slice(start, start + take);
    const next = profiles[start + take]?.id;
    return ctx.json({
      token_exchange_profiles: page,
      ...(next ? { next } : {}),
    });
  },
});

const getProfile = defineRoute({
  route: createRoute({
    tags: ["token-exchange-profiles"],
    method: "get",
    path: "/{id}",
    request: {
      params: idParamSchema,
      headers: tenantHeaderSchema,
    },
    security: [{ Bearer: ["read:token_exchange_profiles"] }],
    responses: {
      200: {
        content: { "application/json": { schema: tokenExchangeProfileSchema } },
        description: "A token exchange profile",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");
    const profile = await requireProfiles(ctx).get(tenantId, id);
    if (!profile) throw new HTTPException(404);
    return ctx.json(profile);
  },
});

const createProfile = defineRoute({
  route: createRoute({
    tags: ["token-exchange-profiles"],
    method: "post",
    path: "/",
    request: {
      body: {
        content: {
          "application/json": { schema: tokenExchangeProfileInsertSchema },
        },
      },
      headers: tenantHeaderSchema,
    },
    security: [{ Bearer: ["create:token_exchange_profiles"] }],
    responses: {
      201: {
        content: { "application/json": { schema: tokenExchangeProfileSchema } },
        description: "Created token exchange profile",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const body = ctx.req.valid("json");

    if (
      (body.action_id === undefined) ===
      (body.jwt_verification === undefined)
    ) {
      badRequest("Provide exactly one of action_id and jwt_verification");
    }
    if (body.action_id) {
      await assertActionUsable(ctx, tenantId, body.action_id);
    }
    if (body.jwt_verification) {
      await assertJwtVerificationUsable(ctx, tenantId, body.jwt_verification);
    }
    await assertSubjectTokenTypeFree(ctx, tenantId, body.subject_token_type);

    const profile = await requireProfiles(ctx).create(tenantId, body);
    await auditLog(ctx, tenantId, "Create token exchange profile", profile);
    return ctx.json(profile, { status: 201 });
  },
});

const updateProfile = defineRoute({
  route: createRoute({
    tags: ["token-exchange-profiles"],
    method: "patch",
    path: "/{id}",
    request: {
      params: idParamSchema,
      body: {
        content: {
          "application/json": { schema: tokenExchangeProfileUpdateSchema },
        },
      },
      headers: tenantHeaderSchema,
    },
    security: [{ Bearer: ["update:token_exchange_profiles"] }],
    responses: {
      200: {
        content: { "application/json": { schema: tokenExchangeProfileSchema } },
        description: "Updated token exchange profile",
      },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");
    const body = ctx.req.valid("json");
    const profiles = requireProfiles(ctx);

    const existing = await profiles.get(tenantId, id);
    if (!existing) throw new HTTPException(404);

    if (body.jwt_verification) {
      // The mode is fixed at creation, like the action a profile runs.
      if (existing.action_id) {
        badRequest(
          "jwt_verification cannot be set on a profile that runs an action",
        );
      }
      await assertJwtVerificationUsable(ctx, tenantId, body.jwt_verification);
    }
    if (body.subject_token_type) {
      await assertSubjectTokenTypeFree(
        ctx,
        tenantId,
        body.subject_token_type,
        id,
      );
    }

    await profiles.update(tenantId, id, body);
    const updated = await profiles.get(tenantId, id);
    if (!updated) throw new HTTPException(404);
    await auditLog(ctx, tenantId, "Update token exchange profile", updated);
    return ctx.json(updated);
  },
});

const deleteProfile = defineRoute({
  route: createRoute({
    tags: ["token-exchange-profiles"],
    method: "delete",
    path: "/{id}",
    request: {
      params: idParamSchema,
      headers: tenantHeaderSchema,
    },
    security: [{ Bearer: ["delete:token_exchange_profiles"] }],
    responses: {
      204: { description: "Deleted" },
    },
  }),
  handler: async (ctx) => {
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");
    const profiles = requireProfiles(ctx);
    const existing = await profiles.get(tenantId, id);
    if (!existing) throw new HTTPException(404);
    await profiles.remove(tenantId, id);
    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Delete token exchange profile",
      targetType: "token_exchange_profile",
      targetId: id,
    });
    return ctx.body(null, 204);
  },
});

export const tokenExchangeProfilesRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  listProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
] as const);
