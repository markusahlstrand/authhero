import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { logMessage } from "../../helpers/logging";
import { querySchema } from "../../types";
import {
  Connection,
  connectionInsertSchema,
  connectionSchema,
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
import { requireTenantId, withTotals, listResponse } from "./helpers";

const connectionsWithTotalsSchema = withTotals({
  connections: z.array(connectionSchema),
});

// Auth0 omits secret fields from connection responses — callers must POST/PATCH
// to set them, and a missing value means "keep existing". Mirror that contract,
// but return a masked hint in a sibling `<field>_hint` so the admin UI can show
// that a secret is set, and which one, without ever exposing the value.
const SECRET_OPTION_FIELDS = [
  { secret: "client_secret", hint: "client_secret_hint" },
  { secret: "app_secret", hint: "app_secret_hint" },
  { secret: "twilio_token", hint: "twilio_token_hint" },
] as const;

type ConnectionOptions = NonNullable<Connection["options"]>;

const MASK = "••••••••";
// Only reveal a prefix for secrets long enough that four characters don't
// meaningfully narrow them down — a short hand-written secret would otherwise
// leak a quarter of itself. The mask is a fixed width regardless of the real
// value, so the hint doesn't leak the length either.
const MIN_HINTABLE_LENGTH = 16;
const HINT_PREFIX_LENGTH = 4;

function secretHint(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  return value.length >= MIN_HINTABLE_LENGTH
    ? `${value.slice(0, HINT_PREFIX_LENGTH)}${MASK}`
    : MASK;
}

// Replace every secret in an options object with its masked hint. Used for
// responses and for audit-log payloads, which would otherwise persist the
// plaintext secret in the logs table.
function redactSecretOptions(options: ConnectionOptions): ConnectionOptions {
  const redacted = { ...options };

  for (const { secret, hint } of SECRET_OPTION_FIELDS) {
    const masked = secretHint(redacted[secret]);
    delete redacted[secret];
    if (masked) {
      redacted[hint] = masked;
    } else {
      delete redacted[hint];
    }
  }

  // The upstream migration credentials live one level down.
  if (redacted.configuration) {
    const configuration = { ...redacted.configuration };
    const masked = secretHint(configuration.client_secret);
    delete configuration.client_secret;
    if (masked) {
      configuration.client_secret_hint = masked;
    } else {
      delete configuration.client_secret_hint;
    }
    redacted.configuration = configuration;
  }

  return redacted;
}

// Normalize the options of an incoming write:
//   - drop the response-only hints, so a client that echoes a GET response back
//     into a PATCH can't persist "3a9f••••••••" as connection state;
//   - drop blank secrets, so a form that submits an untouched, empty secret
//     input is treated as "keep existing" rather than wiping the stored value.
// A secret therefore can't be cleared by sending "" — delete the connection or
// set a new value instead.
function normalizeSecretWrites(options: ConnectionOptions): ConnectionOptions {
  const normalized = { ...options };

  for (const { secret, hint } of SECRET_OPTION_FIELDS) {
    delete normalized[hint];
    if (isBlank(normalized[secret])) {
      delete normalized[secret];
    }
  }

  if (normalized.configuration) {
    const configuration = { ...normalized.configuration };
    delete configuration.client_secret_hint;
    if (isBlank(configuration.client_secret)) {
      delete configuration.client_secret;
    }
    normalized.configuration = configuration;
  }

  return normalized;
}

function isBlank(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "";
}

function stripConnectionSecrets(connection: Connection): Connection {
  if (!connection.options) return connection;
  return { ...connection, options: redactSecretOptions(connection.options) };
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
    const tenantId = requireTenantId(ctx);
    const {
      page,
      per_page,
      include_totals = false,
      sort,
      q,
    } = ctx.req.valid("query");

    const result = await ctx.env.data.connections.list(tenantId, {
      page,
      per_page,
      include_totals,
      sort: parseSort(sort),
      q,
    });

    const connections = result.connections.map(stripConnectionSecrets);

    return ctx.json(
      listResponse(include_totals, { ...result, connections }, "connections"),
    );
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
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");

    const connection = await ctx.env.data.connections.get(tenantId, id);

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
    const tenantId = requireTenantId(ctx);

    const result = await ctx.env.data.connections.remove(tenantId, id);
    if (!result) {
      throw new HTTPException(404, {
        message: "Connection not found",
      });
    }

    await logMessage(ctx, tenantId, {
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
    const tenantId = requireTenantId(ctx);

    const connectionBefore = await ctx.env.data.connections.get(tenantId, id);

    // GET responses strip secrets, so a read→edit→PATCH round-trip would
    // otherwise wipe them. Preserve existing secret fields when the caller
    // didn't send a new value, matching Auth0's "missing = keep" contract.
    // Build a separate patch payload so the original `body` stays free of
    // backfilled secrets for audit logging.
    let patchBody = body;
    if (body.options) {
      const mergedOptions = normalizeSecretWrites(body.options);

      if (connectionBefore?.options) {
        for (const { secret } of SECRET_OPTION_FIELDS) {
          if (
            mergedOptions[secret] === undefined &&
            connectionBefore.options[secret] !== undefined
          ) {
            mergedOptions[secret] = connectionBefore.options[secret];
          }
        }

        // Same "missing = keep" rule for the nested upstream migration secret.
        const previousConfigSecret =
          connectionBefore.options.configuration?.client_secret;
        if (
          mergedOptions.configuration &&
          mergedOptions.configuration.client_secret === undefined &&
          previousConfigSecret !== undefined
        ) {
          mergedOptions.configuration = {
            ...mergedOptions.configuration,
            client_secret: previousConfigSecret,
          };
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

    // Secrets are kept out of API responses, so they must stay out of the
    // audit log too — it would otherwise store them in plaintext.
    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update a Connection",
      beforeState: connectionBefore
        ? (stripConnectionSecrets(connectionBefore) as Record<string, unknown>)
        : undefined,
      afterState: stripConnectionSecrets(connection) as Record<string, unknown>,
      targetType: "connection",
      targetId: id,
      body: body.options
        ? { ...body, options: redactSecretOptions(body.options) }
        : body,
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
    const tenantId = requireTenantId(ctx);

    // Generate ID if not provided
    const connectionId = body.id || generateConnectionId();

    const connection = await ctx.env.data.connections.create(tenantId, {
      ...body,
      id: connectionId,
      options: body.options
        ? normalizeSecretWrites(body.options)
        : body.options,
    });

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Create a Connection",
      afterState: stripConnectionSecrets(connection) as Record<string, unknown>,
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
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");

    // First verify the connection exists
    const connection = await ctx.env.data.connections.get(tenantId, id);

    if (!connection) {
      throw new HTTPException(404, {
        message: "Connection not found",
      });
    }

    // Filter to clients that have this connection enabled. Page through the
    // full client list — a single capped page would silently drop clients on
    // tenants with more than one page's worth.
    const enabledClients: { client_id: string; name: string }[] = [];
    const per_page = 1000;
    for (let page = 0; ; page++) {
      const { clients } = await ctx.env.data.clients.list(tenantId, {
        page,
        per_page,
      });
      enabledClients.push(
        ...clients
          .filter((client) => client.connections?.includes(id))
          .map((client) => ({
            client_id: client.client_id,
            name: client.name,
          })),
      );
      if (clients.length < per_page) break;
    }

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
    const tenantId = requireTenantId(ctx);
    const { id } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    // First verify the connection exists
    const connection = await ctx.env.data.connections.get(tenantId, id);

    if (!connection) {
      throw new HTTPException(404, {
        message: "Connection not found",
      });
    }

    // Process each client update; respond 204 to match Auth0's contract.
    for (const clientUpdate of body) {
      const client = await ctx.env.data.clients.get(
        tenantId,
        clientUpdate.client_id,
      );

      if (!client) {
        continue; // Skip non-existent clients
      }

      const currentConnections = client.connections || [];

      if (clientUpdate.status) {
        // Enable: Add connection if not already present
        if (!currentConnections.includes(id)) {
          await ctx.env.data.clients.update(tenantId, clientUpdate.client_id, {
            connections: [...currentConnections, id],
          });
        }
      } else {
        // Disable: Remove connection if present
        if (currentConnections.includes(id)) {
          await ctx.env.data.clients.update(tenantId, clientUpdate.client_id, {
            connections: currentConnections.filter((c) => c !== id),
          });
        }
      }
    }

    await logMessage(ctx, tenantId, {
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
    const tenantId = requireTenantId(ctx);

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
