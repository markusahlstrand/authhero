import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { logMessage } from "../../helpers/logging";
import { querySchema } from "../../types";
import {
  Connection,
  connectionInsertSchema,
  connectionSchema,
  totalsSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { parseSort } from "../../utils/sort";
import { generateConnectionId } from "../../utils/entity-id";
import {
  ensureTryConnectionClient,
  getTryConnectionResultUrl,
} from "../../helpers/try-connection-client";
import { getEnrichedClient } from "../../helpers/client";
import { getTenantCustomDomain } from "../../helpers/custom-domain";
import { getAuthUrl } from "../../variables";
import { passwordGrant } from "../../authentication-flows/password";
import { isDatabaseConnectionStrategy } from "../../utils/username-password-provider";
import { nanoid } from "nanoid";

import { defineRoute } from "../../utils/define-route";

const connectionsWithTotalsSchema = totalsSchema.extend({
  connections: z.array(connectionSchema),
});

// Auth0 omits secret fields from connection responses — callers must POST/PATCH
// to set them, and a missing value means "keep existing". Mirror that contract.
const SECRET_OPTION_FIELDS = [
  "client_secret",
  "app_secret",
  "twilio_token",
] as const;

function stripConnectionSecrets(connection: Connection): Connection {
  if (!connection.options) return connection;
  const options = { ...connection.options };
  for (const field of SECRET_OPTION_FIELDS) {
    delete options[field];
  }
  return { ...connection, options };
}

// Schema for the connection clients response
const connectionClientsResponseSchema = z.object({
  enabled_clients: z.array(
    z.object({
      client_id: z.string(),
      name: z.string(),
    }),
  ),
});

// Schema for updating connection clients
const updateConnectionClientsSchema = z.array(
  z.object({
    client_id: z.string(),
    status: z.boolean(),
  }),
);
const getRoot = defineRoute({
  route: createRoute({
    tags: ["connections"],
    method: "get",
    path: "/",
    request: {
      query: querySchema,
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },

    security: [
      {
        Bearer: ["read:connections"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.union([
              z.array(connectionSchema),
              connectionsWithTotalsSchema,
            ]),
          },
        },
        description: "List of connections",
      },
    },
  }),
  handler: async (ctx) => {
    const {
      page,
      per_page,
      include_totals = false,
      sort,
      q,
    } = ctx.req.valid("query");

    const result = await ctx.env.data.connections.list(ctx.var.tenant_id, {
      page,
      per_page,
      include_totals,
      sort: parseSort(sort),
      q,
    });

    const connections = result.connections.map(stripConnectionSecrets);

    if (!include_totals) {
      return ctx.json(connections);
    }

    return ctx.json({ ...result, connections });
  },
});

const getById = defineRoute({
  route: createRoute({
    tags: ["connections"],
    method: "get",
    path: "/{id}",
    request: {
      params: z.object({
        id: z.string(),
      }),
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },

    security: [
      {
        Bearer: ["read:connections"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: connectionSchema,
          },
        },
        description: "A connection",
      },
    },
  }),
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");

    const connection = await ctx.env.data.connections.get(
      ctx.var.tenant_id,
      id,
    );

    if (!connection) {
      throw new HTTPException(404);
    }

    return ctx.json(stripConnectionSecrets(connection));
  },
});

const deleteById = defineRoute({
  route: createRoute({
    tags: ["connections"],
    method: "delete",
    path: "/{id}",
    request: {
      params: z.object({
        id: z.string(),
      }),
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["delete:connections"],
      },
    ],
    responses: {
      200: {
        description: "Status",
      },
    },
  }),
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");
    const tenantId = ctx.var.tenant_id;

    const result = await ctx.env.data.connections.remove(tenantId, id);
    if (!result) {
      throw new HTTPException(404, {
        message: "Connection not found",
      });
    }

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Delete a Connection",
      targetType: "connection",
      targetId: id,
    });

    return ctx.text("OK");
  },
});

const patchById = defineRoute({
  route: createRoute({
    tags: ["connections"],
    method: "patch",
    path: "/{id}",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object(connectionInsertSchema.shape).partial(),
          },
        },
      },
      params: z.object({
        id: z.string(),
      }),
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["update:connections"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: connectionSchema,
          },
        },
        description: "The updated connection",
      },
    },
  }),
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");
    const body = ctx.req.valid("json");
    const tenantId = ctx.var.tenant_id;

    const connectionBefore = await ctx.env.data.connections.get(tenantId, id);

    // GET responses strip secrets, so a read→edit→PATCH round-trip would
    // otherwise wipe them. Preserve existing secret fields when the caller
    // didn't send a new value, matching Auth0's "missing = keep" contract.
    // Build a separate patch payload so the original `body` stays free of
    // backfilled secrets for audit logging.
    let patchBody = body;
    if (body.options && connectionBefore?.options) {
      const mergedOptions = { ...body.options };
      for (const field of SECRET_OPTION_FIELDS) {
        if (
          mergedOptions[field] === undefined &&
          connectionBefore.options[field] !== undefined
        ) {
          mergedOptions[field] = connectionBefore.options[field];
        }
      }
      patchBody = { ...body, options: mergedOptions };
    }

    const result = await ctx.env.data.connections.update(
      tenantId,
      id,
      patchBody,
    );
    if (!result) {
      throw new HTTPException(404, {
        message: "Connection not found",
      });
    }

    const connection = await ctx.env.data.connections.get(tenantId, id);

    if (!connection) {
      throw new HTTPException(404, {
        message: "Connection not found",
      });
    }

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update a Connection",
      beforeState: connectionBefore as Record<string, unknown>,
      afterState: connection as Record<string, unknown>,
      targetType: "connection",
      targetId: id,
      body,
    });

    return ctx.json(stripConnectionSecrets(connection));
  },
});

const postRoot = defineRoute({
  route: createRoute({
    tags: ["connections"],
    method: "post",
    path: "/",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object(connectionInsertSchema.shape),
          },
        },
      },
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["create:connections"],
      },
    ],
    responses: {
      201: {
        content: {
          "application/json": {
            schema: connectionSchema,
          },
        },
        description: "A connection",
      },
    },
  }),
  handler: async (ctx) => {
    const body = ctx.req.valid("json");
    const tenantId = ctx.var.tenant_id;

    // Generate ID if not provided
    const connectionId = body.id || generateConnectionId();

    const connection = await ctx.env.data.connections.create(tenantId, {
      ...body,
      id: connectionId,
    });

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Create a Connection",
      afterState: connection as Record<string, unknown>,
      targetType: "connection",
      targetId: connection.id,
    });

    return ctx.json(stripConnectionSecrets(connection), { status: 201 });
  },
});

const getByIdClients = defineRoute({
  route: createRoute({
    tags: ["connections"],
    method: "get",
    path: "/{id}/clients",
    request: {
      params: z.object({
        id: z.string(),
      }),
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["read:connections"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: connectionClientsResponseSchema,
          },
        },
        description: "List of clients enabled for this connection",
      },
    },
  }),
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");

    // First verify the connection exists
    const connection = await ctx.env.data.connections.get(
      ctx.var.tenant_id,
      id,
    );

    if (!connection) {
      throw new HTTPException(404, {
        message: "Connection not found",
      });
    }

    // Get all clients in this tenant
    const { clients } = await ctx.env.data.clients.list(ctx.var.tenant_id, {
      per_page: 1000,
    });

    // Filter to clients that have this connection enabled
    const enabledClients = clients
      .filter((client) => client.connections?.includes(id))
      .map((client) => ({
        client_id: client.client_id,
        name: client.name,
      }));

    return ctx.json({ enabled_clients: enabledClients });
  },
});

const patchByIdClients = defineRoute({
  route: createRoute({
    tags: ["connections"],
    method: "patch",
    path: "/{id}/clients",
    request: {
      body: {
        content: {
          "application/json": {
            schema: updateConnectionClientsSchema,
          },
        },
      },
      params: z.object({
        id: z.string(),
      }),
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["update:connections"],
      },
    ],
    responses: {
      204: {
        description: "Clients updated successfully (No Content)",
      },
    },
  }),
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    // First verify the connection exists
    const connection = await ctx.env.data.connections.get(
      ctx.var.tenant_id,
      id,
    );

    if (!connection) {
      throw new HTTPException(404, {
        message: "Connection not found",
      });
    }

    // Process each client update; respond 204 to match Auth0's contract.
    for (const clientUpdate of body) {
      const client = await ctx.env.data.clients.get(
        ctx.var.tenant_id,
        clientUpdate.client_id,
      );

      if (!client) {
        continue; // Skip non-existent clients
      }

      const currentConnections = client.connections || [];

      if (clientUpdate.status) {
        // Enable: Add connection if not already present
        if (!currentConnections.includes(id)) {
          await ctx.env.data.clients.update(
            ctx.var.tenant_id,
            clientUpdate.client_id,
            {
              connections: [...currentConnections, id],
            },
          );
        }
      } else {
        // Disable: Remove connection if present
        if (currentConnections.includes(id)) {
          await ctx.env.data.clients.update(
            ctx.var.tenant_id,
            clientUpdate.client_id,
            {
              connections: currentConnections.filter((c) => c !== id),
            },
          );
        }
      }
    }

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update Connection Clients",
      targetType: "connection_client",
      targetId: id,
    });

    return ctx.body(null, 204);
  },
});

const postByIdTry = defineRoute({
  route: createRoute({
    tags: ["connections"],
    method: "post",
    path: "/{id}/try",
    request: {
      params: z.object({ id: z.string() }),
      headers: z.object({ "tenant-id": z.string().optional() }),
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                username: z.string().optional(),
                password: z.string().optional(),
              })
              .optional(),
          },
        },
      },
    },
    security: [{ Bearer: ["update:connections"] }],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.union([
              z.object({
                mode: z.literal("redirect"),
                authorize_url: z.string(),
                state: z.string(),
                result_url: z.string(),
                client_id: z.string(),
                connection: z.object({
                  id: z.string(),
                  name: z.string(),
                  strategy: z.string(),
                }),
              }),
              z.object({
                mode: z.literal("inline"),
                status: z.enum(["success", "error"]),
                connection_id: z.string(),
                connection_name: z.string(),
                strategy: z.string(),
                userinfo: z.record(z.string(), z.unknown()).optional(),
                raw: z.record(z.string(), z.unknown()).nullable().optional(),
                error: z.string().optional(),
                error_description: z.string().optional(),
              }),
            ]),
          },
        },
        description:
          "Test outcome (inline) or how to drive the test (redirect)",
      },
    },
  }),
  handler: async (ctx) => {
    const { id } = ctx.req.valid("param");
    const tenantId = ctx.var.tenant_id;

    const connection = await ctx.env.data.connections.get(tenantId, id);
    if (!connection) {
      throw new HTTPException(404, { message: "Connection not found" });
    }
    const connectionId: string = connection.id ?? id;

    const clientId = await ensureTryConnectionClient(ctx.env, tenantId);

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Try Connection initiated",
      targetType: "connection",
      targetId: id,
    });

    // Database connections complete inline — no browser round-trip needed.
    if (isDatabaseConnectionStrategy(connection.strategy)) {
      const body = ctx.req.valid("json") ?? {};
      if (!body.username || !body.password) {
        throw new HTTPException(400, {
          message:
            "username and password are required for database connections",
        });
      }

      const client = await getEnrichedClient(ctx.env, clientId, tenantId);
      try {
        const result = await passwordGrant(
          ctx,
          client,
          {
            username: body.username,
            password: body.password,
            client_id: clientId,
          },
          undefined,
          connection.name,
        );
        const { user } = result;
        return ctx.json({
          mode: "inline" as const,
          status: "success" as const,
          connection_id: connectionId,
          connection_name: connection.name,
          strategy: connection.strategy,
          userinfo: user as unknown as Record<string, unknown>,
          raw: user as unknown as Record<string, unknown>,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Password login failed";
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : "error";
        return ctx.json({
          mode: "inline" as const,
          status: "error" as const,
          connection_id: connectionId,
          connection_name: connection.name,
          strategy: connection.strategy,
          error: code,
          error_description: message,
        });
      }
    }

    // Browser-driven flow: build the /authorize URL pinned to this
    // connection and the internal test client. The state is generated
    // here so the portal can correlate the popup result.
    // Prefer the tenant's custom domain so the whole popup flow — including
    // the result page that posts back to the opener — runs on the same
    // origin the end user's real logins use.
    const customDomain = await getTenantCustomDomain(ctx.env, tenantId);

    const state = nanoid();
    const resultUrlObj = new URL(
      getTryConnectionResultUrl(ctx.env, customDomain),
    );
    // Propagate the caller's origin so the result screen can post the
    // outcome back to the exact opener instead of broadcasting with '*'.
    const requestOrigin = ctx.req.header("origin");
    if (requestOrigin) {
      try {
        const parsedOrigin = new URL(requestOrigin);
        if (parsedOrigin.origin === requestOrigin) {
          resultUrlObj.searchParams.set("opener_origin", requestOrigin);
        }
      } catch {
        // ignore malformed Origin header
      }
    }
    const resultUrl = resultUrlObj.toString();
    const authUrl = getAuthUrl(ctx.env, customDomain);
    const authorizeUrl = new URL(`${authUrl}authorize`);
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "openid profile email");
    authorizeUrl.searchParams.set("connection", connection.name);
    authorizeUrl.searchParams.set("redirect_uri", resultUrl);
    authorizeUrl.searchParams.set("state", state);

    return ctx.json({
      mode: "redirect" as const,
      authorize_url: authorizeUrl.toString(),
      state,
      result_url: resultUrl,
      client_id: clientId,
      connection: {
        id: connectionId,
        name: connection.name,
        strategy: connection.strategy,
      },
    });
  },
});

export const connectionRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  getRoot,
  getById,
  deleteById,
  patchById,
  postRoot,
  getByIdClients,
  patchByIdClients,
  postByIdTry,
] as const);
