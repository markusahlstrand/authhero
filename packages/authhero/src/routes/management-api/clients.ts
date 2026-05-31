import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  clientSchema,
  clientInsertSchema,
  totalsSchema,
  connectionSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { logMessage } from "../../helpers/logging";
import { nanoid } from "nanoid";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import { isCimdClientId } from "../../helpers/cimd";

import { defineRoute } from "../../utils/define-route";

// CIMD clients are managed via their metadata document URL, not the management
// API. Any locally-stored fields the document controls (name, callbacks,
// grant_types, token_endpoint_auth_method, jwks_uri) get overwritten on the
// next /authorize, so accepting writes here would be misleading. Detect via
// the `client_metadata.cimd === "true"` marker set by ensureCimdStubClient.
function isCimdClient(
  client: {
    client_id?: string;
    client_metadata?: Record<string, string> | null;
  } | null,
): boolean {
  if (client?.client_metadata?.cimd !== "true") return false;
  if (!client.client_id) return false;
  return isCimdClientId(client.client_id);
}

// External callers must not be able to forge the CIMD marker via
// client_metadata.cimd. Only ensureCimdStubClient (internal) should set it.
function stripCimdMetadata<
  T extends { client_metadata?: Record<string, string> | null },
>(body: T): T {
  if (!body.client_metadata) return body;
  const { cimd: _cimd, ...rest } = body.client_metadata;
  return { ...body, client_metadata: rest };
}

// Auth0-parity defaults: when a client is created with an `app_type` but no
// explicit `token_endpoint_auth_method` / `grant_types`, derive them from the
// type. Native and SPA are public (PKCE-only, no secret); Regular Web is
// confidential with code+refresh; Machine-to-Machine (non_interactive) is
// confidential with client_credentials only. Explicit values from the caller
// always win — defaults only fill gaps.
const APP_TYPE_DEFAULTS: Record<
  string,
  {
    token_endpoint_auth_method:
      | "none"
      | "client_secret_post"
      | "client_secret_basic"
      | "client_secret_jwt"
      | "private_key_jwt";
    grant_types: string[];
  }
> = {
  native: {
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
  },
  spa: {
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
  },
  regular_web: {
    token_endpoint_auth_method: "client_secret_basic",
    grant_types: ["authorization_code", "refresh_token"],
  },
  non_interactive: {
    token_endpoint_auth_method: "client_secret_basic",
    grant_types: ["client_credentials"],
  },
};

// Zod fills `app_type`, `token_endpoint_auth_method`, and `grant_types` with
// schema defaults before we see the body, so we can't tell from the validated
// value whether the caller meant it. Inspect the raw JSON keys to detect
// explicit intent, and only derive from app_type when the caller chose one.
function applyAppTypeDefaults<
  T extends {
    app_type?: string;
    token_endpoint_auth_method?: string;
    grant_types?: string[];
  },
>(body: T, raw: Record<string, unknown>): T {
  const rawAppType = raw.app_type;
  if (typeof rawAppType !== "string") return body;
  const defaults = APP_TYPE_DEFAULTS[rawAppType];
  if (!defaults) return body;
  return {
    ...body,
    token_endpoint_auth_method:
      "token_endpoint_auth_method" in raw
        ? body.token_endpoint_auth_method
        : defaults.token_endpoint_auth_method,
    grant_types: "grant_types" in raw ? body.grant_types : defaults.grant_types,
  };
}
const clientWithTotalsSchema = totalsSchema.extend({
  clients: z.array(clientSchema),
});

// Schema for client connections response
const clientConnectionsResponseSchema = z.object({
  enabled_connections: z.array(
    z.object({
      connection_id: z.string(),
      connection: connectionSchema.optional(),
    }),
  ),
});

// Schema for updating client connections - ordered array of connection IDs
const updateClientConnectionsSchema = z.array(z.string());
const getRoot = defineRoute({
  route: createRoute({
    tags: ["clients"],
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
        Bearer: ["read:clients"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.union([clientWithTotalsSchema, z.array(clientSchema)]),
          },
        },
        description: "List of clients",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const { page, per_page, include_totals, sort, q } = ctx.req.valid("query");

    const result = await ctx.env.data.clients.list(tenant_id, {
      page,
      per_page,
      include_totals,
      sort: parseSort(sort),
      q,
    });

    const clients = result.clients;

    if (include_totals) {
      return ctx.json({
        clients,
        start: result.totals?.start ?? 0,
        limit: result.totals?.limit ?? per_page,
        length: result.totals?.length ?? clients.length,
        total: result.totals?.total,
      });
    }

    return ctx.json(clients);
  },
});

const getById = defineRoute({
  route: createRoute({
    tags: ["clients"],
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
        Bearer: ["read:clients"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: clientSchema,
          },
        },
        description: "A client",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const { id } = ctx.req.valid("param");

    const client = await ctx.env.data.clients.get(tenant_id, id);

    if (!client) {
      throw new HTTPException(404);
    }

    return ctx.json(client);
  },
});

const deleteById = defineRoute({
  route: createRoute({
    tags: ["clients"],
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
        Bearer: ["delete:clients"],
      },
    ],
    responses: {
      200: {
        description: "Status",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const { id } = ctx.req.valid("param");

    const result = await ctx.env.data.clients.remove(tenant_id, id);
    if (!result) {
      throw new HTTPException(404, { message: "Client not found" });
    }

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Delete a Client",
      targetType: "client",
      targetId: id,
    });

    return ctx.text("OK");
  },
});

const patchById = defineRoute({
  route: createRoute({
    tags: ["clients"],
    method: "patch",
    path: "/{id}",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object(clientInsertSchema.shape).partial(),
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
        Bearer: ["update:clients"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: clientSchema,
          },
        },
        description: "The updated client",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const { id } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    const clientUpdate = stripCimdMetadata(body);

    const clientBefore = await ctx.env.data.clients.get(tenant_id, id);
    if (isCimdClient(clientBefore)) {
      throw new HTTPException(400, {
        message: `Client is managed via its Client ID Metadata Document at ${id}. Update the document instead.`,
      });
    }
    await ctx.env.data.clients.update(tenant_id, id, clientUpdate);
    const client = await ctx.env.data.clients.get(tenant_id, id);

    if (!client) {
      throw new HTTPException(404, { message: "Client not found" });
    }

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update a Client",
      beforeState: clientBefore as Record<string, unknown>,
      afterState: client as Record<string, unknown>,
      targetType: "client",
      targetId: id,
      body,
    });

    return ctx.json(client);
  },
});

const postRoot = defineRoute({
  route: createRoute({
    tags: ["clients"],
    method: "post",
    path: "/",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object(clientInsertSchema.shape),
          },
        },
      },
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["create:clients"],
      },
    ],
    responses: {
      201: {
        content: {
          "application/json": {
            schema: z.object(clientSchema.shape),
          },
        },
        description: "A client",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const body = stripCimdMetadata(ctx.req.valid("json"));
    const rawBody = (await ctx.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (body.client_id && isCimdClientId(body.client_id)) {
      throw new HTTPException(400, {
        message:
          "Cannot create a Client ID Metadata Document client via the management API. CIMD clients are registered automatically on first /authorize.",
      });
    }

    const withDefaults = applyAppTypeDefaults(body, rawBody);
    const isPublic = withDefaults.token_endpoint_auth_method === "none";

    const clientCreate = {
      ...withDefaults,
      client_id: withDefaults.client_id || nanoid(),
      // Public clients (SPA, Native) authenticate via PKCE and have no secret.
      // Only generate a secret when the caller will actually use it.
      client_secret: isPublic
        ? undefined
        : withDefaults.client_secret || nanoid(),
    };

    const client = await ctx.env.data.clients.create(tenant_id, clientCreate);

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Create a Client",
      afterState: client as Record<string, unknown>,
      targetType: "client",
      targetId: client.client_id,
    });

    return ctx.json(client, { status: 201 });
  },
});

const getByIdConnections = defineRoute({
  route: createRoute({
    tags: ["clients"],
    method: "get",
    path: "/{id}/connections",
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
        Bearer: ["read:clients"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: clientConnectionsResponseSchema,
          },
        },
        description: "List of connections enabled for this client",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const { id } = ctx.req.valid("param");

    const client = await ctx.env.data.clients.get(tenant_id, id);

    if (!client) {
      throw new HTTPException(404, { message: "Client not found" });
    }

    // If no connections are defined, return all available connections
    const hasDefinedConnections =
      client.connections && client.connections.length > 0;

    let enabledConnections: Array<{
      connection_id: string;
      connection?: (typeof connectionSchema)["_output"];
    }>;

    if (hasDefinedConnections) {
      // Fetch full connection details for each enabled connection
      enabledConnections = await Promise.all(
        client.connections!.map(async (connectionId) => {
          const connection = await ctx.env.data.connections.get(
            tenant_id,
            connectionId,
          );
          return {
            connection_id: connectionId,
            connection: connection || undefined,
          };
        }),
      );
    } else {
      // No connections defined - return all available connections
      const { connections: allConnections } =
        await ctx.env.data.connections.list(tenant_id, {});
      enabledConnections = allConnections
        .filter((connection) => connection.id)
        .map((connection) => ({
          connection_id: connection.id!,
          connection,
        }));
    }

    return ctx.json({ enabled_connections: enabledConnections });
  },
});

const patchByIdConnections = defineRoute({
  route: createRoute({
    tags: ["clients"],
    method: "patch",
    path: "/{id}/connections",
    request: {
      body: {
        content: {
          "application/json": {
            schema: updateClientConnectionsSchema,
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
        Bearer: ["update:clients"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: clientConnectionsResponseSchema,
          },
        },
        description: "Updated list of connections for this client",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const { id } = ctx.req.valid("param");
    const connectionIds = ctx.req.valid("json");

    const client = await ctx.env.data.clients.get(tenant_id, id);

    if (!client) {
      throw new HTTPException(404, { message: "Client not found" });
    }

    // Validate all connection IDs exist and filter out invalid ones
    const validConnectionIds: string[] = [];
    for (const connectionId of connectionIds) {
      const connection = await ctx.env.data.connections.get(
        tenant_id,
        connectionId,
      );
      if (connection) {
        validConnectionIds.push(connectionId);
      }
    }

    // Update the client with the new ordered connections array
    // Use clientConnections.updateByClient which also invalidates the
    // clientConnections cache (clients.update alone only invalidates the
    // clients cache, not clientConnections — important on Cloudflare where
    // deleteByPrefix is a no-op).
    await ctx.env.data.clientConnections.updateByClient(
      tenant_id,
      id,
      validConnectionIds,
    );

    // Fetch and return the updated connections
    const enabledConnections = await Promise.all(
      validConnectionIds.map(async (connectionId) => {
        const connection = await ctx.env.data.connections.get(
          tenant_id,
          connectionId,
        );
        return {
          connection_id: connectionId,
          connection: connection || undefined,
        };
      }),
    );

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update Client Connections",
      targetType: "client_connection",
      targetId: id,
    });

    return ctx.json({ enabled_connections: enabledConnections });
  },
});

export const clientRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  getRoot,
  getById,
  deleteById,
  patchById,
  postRoot,
  getByIdConnections,
  patchByIdConnections,
] as const);
