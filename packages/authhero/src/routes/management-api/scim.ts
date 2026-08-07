import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  LogTypes,
  scimMappingEntrySchema,
  ScimConfiguration,
  ScimConfigurationsAdapter,
  ScimTokensAdapter,
  Connection,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { logMessage } from "../../helpers/logging";
import { defineRoute } from "../../utils/define-route";
import { requireTenantId } from "./helpers";
import { mintScimToken } from "../../helpers/scim/mint-token";
import {
  DEFAULT_SCIM_MAPPING,
  DEFAULT_USER_ID_ATTRIBUTE,
} from "../../helpers/scim/default-mapping";

// ---------------------------------------------------------------------------
// Schemas (Auth0-parity response shapes)
// ---------------------------------------------------------------------------

const scimConfigurationResponseSchema = z.object({
  connection_id: z.string(),
  connection_name: z.string(),
  strategy: z.string(),
  user_id_attribute: z.string(),
  mapping: z.array(scimMappingEntrySchema),
  created_at: z.string(),
  updated_at: z.string(),
});

const scimConfigurationBodySchema = z.object({
  user_id_attribute: z.string().optional().openapi({
    description:
      "Which SCIM attribute is used as the stable external identifier. Defaults to `externalId`.",
  }),
  mapping: z.array(scimMappingEntrySchema).optional().openapi({
    description:
      "Attribute mapping between SCIM resource fields and AuthHero user fields. Defaults to the standard mapping when omitted.",
  }),
});

// Token metadata never includes the raw secret.
const scimTokenMetadataSchema = z.object({
  token_id: z.string(),
  scopes: z.array(z.string()),
  valid_until: z.string().optional(),
  created_at: z.string(),
  last_used_at: z.string().optional(),
});

const scimTokenCreateBodySchema = z.object({
  scopes: z.array(z.string()).optional(),
  valid_until: z.string().datetime().optional().openapi({
    description: "ISO timestamp after which the token is rejected.",
  }),
});

const scimTokenCreatedSchema = scimTokenMetadataSchema.extend({
  token: z.string().openapi({
    description: "The bearer token. Shown once and not retrievable later.",
  }),
});

const tenantIdHeaderSchema = z.object({
  "tenant-id": z.string().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ScimAdapters {
  scimConfigurations: ScimConfigurationsAdapter;
  scimTokens: ScimTokensAdapter;
}

/**
 * Guards that the deployment wired the SCIM adapters. Mirrors how other
 * optional-adapter routes fail closed; the routes are only mounted when the
 * adapters are present, so this is defense-in-depth.
 */
function requireScim(data: {
  scimConfigurations?: ScimConfigurationsAdapter;
  scimTokens?: ScimTokensAdapter;
}): ScimAdapters {
  if (!data.scimConfigurations || !data.scimTokens) {
    throw new HTTPException(501, {
      message: "SCIM is not supported by this deployment",
    });
  }
  return {
    scimConfigurations: data.scimConfigurations,
    scimTokens: data.scimTokens,
  };
}

async function requireConnection(
  ctx: {
    env: {
      data: {
        connections: {
          get: (t: string, c: string) => Promise<Connection | null>;
        };
      };
    };
  },
  tenant_id: string,
  connection_id: string,
): Promise<Connection> {
  const connection = await ctx.env.data.connections.get(
    tenant_id,
    connection_id,
  );
  if (!connection) {
    throw new HTTPException(404, { message: "Connection not found" });
  }
  return connection;
}

function toConfigurationResponse(
  configuration: ScimConfiguration,
  connection: Connection,
): z.infer<typeof scimConfigurationResponseSchema> {
  return {
    connection_id: configuration.connection_id,
    connection_name: connection.name,
    strategy: connection.strategy,
    user_id_attribute: configuration.user_id_attribute,
    mapping: configuration.mapping,
    created_at: configuration.created_at,
    updated_at: configuration.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const getConfiguration = defineRoute({
  route: createRoute({
    tags: ["scim"],
    method: "get",
    path: "/",
    request: { headers: tenantIdHeaderSchema },
    security: [{ Bearer: ["read:scim_config"] }],
    responses: {
      200: {
        content: {
          "application/json": { schema: scimConfigurationResponseSchema },
        },
        description: "The SCIM configuration for the connection",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const connection_id = ctx.req.param("id")!;
    const { scimConfigurations } = requireScim(ctx.env.data);

    const connection = await requireConnection(ctx, tenant_id, connection_id);
    const configuration = await scimConfigurations.get(
      tenant_id,
      connection_id,
    );
    if (!configuration) {
      throw new HTTPException(404, { message: "SCIM configuration not found" });
    }

    return ctx.json(toConfigurationResponse(configuration, connection), 200);
  },
});

const createConfiguration = defineRoute({
  route: createRoute({
    tags: ["scim"],
    method: "post",
    path: "/",
    request: {
      headers: tenantIdHeaderSchema,
      body: {
        content: {
          "application/json": { schema: scimConfigurationBodySchema },
        },
      },
    },
    security: [{ Bearer: ["create:scim_config"] }],
    responses: {
      201: {
        content: {
          "application/json": { schema: scimConfigurationResponseSchema },
        },
        description: "The created SCIM configuration",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const connection_id = ctx.req.param("id")!;
    const body = ctx.req.valid("json");
    const { scimConfigurations } = requireScim(ctx.env.data);

    const connection = await requireConnection(ctx, tenant_id, connection_id);

    const existing = await scimConfigurations.get(tenant_id, connection_id);
    if (existing) {
      throw new HTTPException(409, {
        message: "SCIM configuration already exists for this connection",
      });
    }

    const configuration = await scimConfigurations.create(tenant_id, {
      connection_id,
      user_id_attribute: body.user_id_attribute ?? DEFAULT_USER_ID_ATTRIBUTE,
      mapping: body.mapping ?? DEFAULT_SCIM_MAPPING,
    });

    await logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "SCIM configuration created",
      targetType: "scim_configuration",
      targetId: connection_id,
    });

    return ctx.json(toConfigurationResponse(configuration, connection), 201);
  },
});

const updateConfiguration = defineRoute({
  route: createRoute({
    tags: ["scim"],
    method: "patch",
    path: "/",
    request: {
      headers: tenantIdHeaderSchema,
      body: {
        content: {
          "application/json": { schema: scimConfigurationBodySchema },
        },
      },
    },
    security: [{ Bearer: ["update:scim_config"] }],
    responses: {
      200: {
        content: {
          "application/json": { schema: scimConfigurationResponseSchema },
        },
        description: "The updated SCIM configuration",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const connection_id = ctx.req.param("id")!;
    const body = ctx.req.valid("json");
    const { scimConfigurations } = requireScim(ctx.env.data);

    const connection = await requireConnection(ctx, tenant_id, connection_id);

    const updated = await scimConfigurations.update(tenant_id, connection_id, {
      user_id_attribute: body.user_id_attribute,
      mapping: body.mapping,
    });
    if (!updated) {
      throw new HTTPException(404, { message: "SCIM configuration not found" });
    }

    const configuration = await scimConfigurations.get(
      tenant_id,
      connection_id,
    );

    await logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "SCIM configuration updated",
      targetType: "scim_configuration",
      targetId: connection_id,
    });

    return ctx.json(toConfigurationResponse(configuration!, connection), 200);
  },
});

const deleteConfiguration = defineRoute({
  route: createRoute({
    tags: ["scim"],
    method: "delete",
    path: "/",
    request: { headers: tenantIdHeaderSchema },
    security: [{ Bearer: ["delete:scim_config"] }],
    responses: {
      204: { description: "The SCIM configuration was deleted" },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const connection_id = ctx.req.param("id")!;
    const { scimConfigurations, scimTokens } = requireScim(ctx.env.data);

    const removed = await scimConfigurations.remove(tenant_id, connection_id);
    if (!removed) {
      throw new HTTPException(404, { message: "SCIM configuration not found" });
    }

    // Tokens are meaningless without the configuration — remove them too.
    const tokens = await scimTokens.listByConnection(tenant_id, connection_id);
    for (const token of tokens) {
      await scimTokens.remove(tenant_id, token.token_id);
    }

    await logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "SCIM configuration deleted",
      targetType: "scim_configuration",
      targetId: connection_id,
    });

    return ctx.body(null, 204);
  },
});

const getDefaultMapping = defineRoute({
  route: createRoute({
    tags: ["scim"],
    method: "get",
    path: "/default-mapping",
    request: { headers: tenantIdHeaderSchema },
    security: [{ Bearer: ["read:scim_config"] }],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              user_id_attribute: z.string(),
              mapping: z.array(scimMappingEntrySchema),
            }),
          },
        },
        description: "The default SCIM attribute mapping",
      },
    },
  }),
  handler: async (ctx) => {
    return ctx.json(
      {
        user_id_attribute: DEFAULT_USER_ID_ATTRIBUTE,
        mapping: DEFAULT_SCIM_MAPPING,
      },
      200,
    );
  },
});

const listTokens = defineRoute({
  route: createRoute({
    tags: ["scim"],
    method: "get",
    path: "/tokens",
    request: { headers: tenantIdHeaderSchema },
    security: [{ Bearer: ["read:scim_token"] }],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.array(scimTokenMetadataSchema),
          },
        },
        description: "SCIM token metadata (never the raw secrets)",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const connection_id = ctx.req.param("id")!;
    const { scimTokens } = requireScim(ctx.env.data);

    await requireConnection(ctx, tenant_id, connection_id);

    const tokens = await scimTokens.listByConnection(tenant_id, connection_id);
    return ctx.json(
      tokens.map((token) => ({
        token_id: token.token_id,
        scopes: token.scopes,
        valid_until: token.valid_until,
        created_at: token.created_at,
        last_used_at: token.last_used_at,
      })),
      200,
    );
  },
});

const createToken = defineRoute({
  route: createRoute({
    tags: ["scim"],
    method: "post",
    path: "/tokens",
    request: {
      headers: tenantIdHeaderSchema,
      body: {
        content: {
          "application/json": { schema: scimTokenCreateBodySchema },
        },
      },
    },
    security: [{ Bearer: ["create:scim_token"] }],
    responses: {
      201: {
        content: {
          "application/json": { schema: scimTokenCreatedSchema },
        },
        description:
          "The created SCIM token. The `token` field is shown once and not retrievable later.",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const connection_id = ctx.req.param("id")!;
    const body = ctx.req.valid("json");
    const { scimConfigurations, scimTokens } = requireScim(ctx.env.data);

    await requireConnection(ctx, tenant_id, connection_id);

    // A token is only useful against an existing configuration.
    const configuration = await scimConfigurations.get(
      tenant_id,
      connection_id,
    );
    if (!configuration) {
      throw new HTTPException(404, { message: "SCIM configuration not found" });
    }

    const generated = await mintScimToken();
    const record = await scimTokens.create(tenant_id, {
      token_id: generated.token_id,
      connection_id,
      token_hash: generated.token_hash,
      scopes: body.scopes ?? [],
      valid_until: body.valid_until,
    });

    await logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "SCIM token created",
      targetType: "scim_token",
      targetId: record.token_id,
    });

    return ctx.json(
      {
        token_id: record.token_id,
        token: generated.token,
        scopes: record.scopes,
        valid_until: record.valid_until,
        created_at: record.created_at,
        last_used_at: record.last_used_at,
      },
      201,
    );
  },
});

const deleteToken = defineRoute({
  route: createRoute({
    tags: ["scim"],
    method: "delete",
    path: "/tokens/{tokenId}",
    request: { headers: tenantIdHeaderSchema },
    security: [{ Bearer: ["delete:scim_token"] }],
    responses: {
      204: { description: "The SCIM token was deleted" },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = requireTenantId(ctx);
    const token_id = ctx.req.param("tokenId")!;
    const { scimTokens } = requireScim(ctx.env.data);

    const removed = await scimTokens.remove(tenant_id, token_id);
    if (!removed) {
      throw new HTTPException(404, { message: "SCIM token not found" });
    }

    await logMessage(ctx, tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "SCIM token deleted",
      targetType: "scim_token",
      targetId: token_id,
    });

    return ctx.body(null, 204);
  },
});

export const scimConfigurationRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  getConfiguration,
  createConfiguration,
  updateConfiguration,
  deleteConfiguration,
  getDefaultMapping,
  listTokens,
  createToken,
  deleteToken,
] as const);
