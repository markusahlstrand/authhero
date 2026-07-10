import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import {
  clientGrantInsertSchema,
  clientGrantSchema,
  totalsSchema,
  LogTypes,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";

import { defineRoute } from "../../utils/define-route";
// Auth0-compatible query schema for client grants
const clientGrantsQuerySchema = z.object({
  per_page: z
    .string()
    .min(1)
    .optional()
    .default("50")
    .transform((p) => parseInt(p, 10))
    .openapi({
      description: "Number of results per page. Defaults to 50.",
    }),
  page: z
    .string()
    .min(0)
    .optional()
    .default("0")
    .transform((p) => parseInt(p, 10))
    .openapi({
      description: "Page index of the results to return. First page is 0.",
    }),
  include_totals: z
    .string()
    .optional()
    .default("false")
    .transform((it) => it === "true")
    .openapi({
      description:
        "Return results inside an object that contains the total result count (true) or as a direct array of results (false, default).",
    }),
  from: z.string().optional().openapi({
    description: "Optional Id from which to start selection.",
  }),
  take: z
    .string()
    .min(1)
    .optional()
    .transform((p) => (p ? parseInt(p, 10) : undefined))
    .openapi({
      description: "Number of results per page. Defaults to 50.",
    }),
  audience: z.string().optional().openapi({
    description: "Optional filter on audience.",
  }),
  client_id: z.string().optional().openapi({
    description: "Optional filter on client_id.",
  }),
  allow_any_organization: z
    .string()
    .optional()
    .transform((val) =>
      val === "true" ? true : val === "false" ? false : undefined,
    )
    .openapi({
      description: "Optional filter on allow_any_organization.",
    }),
  subject_type: z.enum(["client", "user"]).optional().openapi({
    description:
      "EA The type of application access the client grant allows. Use of this field is subject to the applicable Free Trial terms in Okta's Master Subscription Agreement.",
  }),
});

const clientGrantsWithTotalsSchema = totalsSchema.extend({
  client_grants: z.array(clientGrantSchema),
});

// Checkpoint (keyset) pagination response: items plus an opaque cursor.
const clientGrantsWithNextSchema = z.object({
  client_grants: z.array(clientGrantSchema),
  next: z.string().optional().openapi({
    description: "Opaque cursor for the next page; absent on the last page.",
  }),
});
const getRoot = defineRoute({
  route: createRoute({
    tags: ["client-grants"],
    method: "get",
    path: "/",
    request: {
      query: clientGrantsQuerySchema,
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },

    security: [
      {
        Bearer: ["read:client_grants"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.union([
              z.array(clientGrantSchema),
              clientGrantsWithTotalsSchema,
              clientGrantsWithNextSchema,
            ]),
          },
        },
        description: "List of client grants",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;

    const {
      page,
      per_page,
      include_totals = false,
      from,
      take,
      audience,
      client_id,
      allow_any_organization,
      subject_type,
    } = ctx.req.valid("query");

    // Build lucene query from Auth0 parameters
    const queryParts: string[] = [];

    if (client_id) {
      queryParts.push(`client_id:"${client_id}"`);
    }

    if (audience) {
      queryParts.push(`audience:"${audience}"`);
    }

    if (allow_any_organization !== undefined) {
      queryParts.push(`allow_any_organization:${allow_any_organization}`);
    }

    if (subject_type) {
      queryParts.push(`subject_type:"${subject_type}"`);
    }

    const luceneQuery =
      queryParts.length > 0 ? queryParts.join(" AND ") : undefined;

    const result = await ctx.env.data.clientGrants.list(tenant_id, {
      page,
      per_page,
      include_totals,
      q: luceneQuery,
      from,
      take,
    });

    // Keyset (checkpoint) pagination: return Auth0's { items, next } shape so
    // clients can page past the first page via the opaque cursor.
    if (from !== undefined || take !== undefined) {
      return ctx.json({
        client_grants: result.client_grants,
        next: result.next,
      });
    }

    if (!include_totals) {
      return ctx.json(result.client_grants);
    }

    return ctx.json(result);
  },
});

const getById = defineRoute({
  route: createRoute({
    tags: ["client-grants"],
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
        Bearer: ["read:client_grants"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: clientGrantSchema,
          },
        },
        description: "A client grant",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const { id } = ctx.req.valid("param");

    const clientGrant = await ctx.env.data.clientGrants.get(tenant_id, id);

    if (!clientGrant) {
      throw new HTTPException(404, {
        message: "Client grant not found",
      });
    }

    return ctx.json(clientGrant);
  },
});

const deleteById = defineRoute({
  route: createRoute({
    tags: ["client-grants"],
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
        Bearer: ["delete:client_grants"],
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

    const result = await ctx.env.data.clientGrants.remove(tenant_id, id);
    if (!result) {
      throw new HTTPException(404, {
        message: "Client grant not found",
      });
    }

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Delete a Client Grant",
      targetType: "client_grant",
      targetId: id,
    });

    return ctx.text("OK");
  },
});

const patchById = defineRoute({
  route: createRoute({
    tags: ["client-grants"],
    method: "patch",
    path: "/{id}",
    request: {
      params: z.object({
        id: z.string(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object(clientGrantInsertSchema.shape).partial(),
          },
        },
      },
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["update:client_grants"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: clientGrantSchema,
          },
        },
        description: "The updated client grant",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const { id } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    const exists = await ctx.env.data.clientGrants.get(tenant_id, id);
    if (!exists) {
      throw new HTTPException(404, {
        message: "Client grant not found",
      });
    }

    const updated = await ctx.env.data.clientGrants.update(tenant_id, id, body);

    if (!updated) {
      throw new HTTPException(500, {
        message: "Failed to update client grant",
      });
    }

    const clientGrant = await ctx.env.data.clientGrants.get(tenant_id, id);
    if (!clientGrant) {
      throw new HTTPException(404, {
        message: "Client grant not found",
      });
    }

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update a Client Grant",
      targetType: "client_grant",
      targetId: id,
      beforeState: exists as Record<string, unknown>,
      afterState: clientGrant as Record<string, unknown>,
    });

    return ctx.json(clientGrant);
  },
});

const postRoot = defineRoute({
  route: createRoute({
    tags: ["client-grants"],
    method: "post",
    path: "/",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object(clientGrantInsertSchema.shape),
          },
        },
      },
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [
      {
        Bearer: ["create:client_grants"],
      },
    ],
    responses: {
      201: {
        content: {
          "application/json": {
            schema: clientGrantSchema,
          },
        },
        description: "A client grant",
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const body = ctx.req.valid("json");

    const clientGrant = await ctx.env.data.clientGrants.create(tenant_id, body);

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Create a Client Grant",
      targetType: "client_grant",
      targetId: clientGrant.id,
      afterState: clientGrant as Record<string, unknown>,
    });

    return ctx.json(clientGrant, { status: 201 });
  },
});

export const clientGrantRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  getRoot,
  getById,
  deleteById,
  patchById,
  postRoot,
] as const);
