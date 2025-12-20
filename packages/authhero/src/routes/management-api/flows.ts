import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { querySchema } from "../../types";
import {
  flowInsertSchema,
  flowSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";
import { parseSort } from "../../utils/sort";
import { generateFlowId } from "../../utils/entity-id";

const flowsWithTotalsSchema = totalsSchema.extend({
  flows: z.array(flowSchema),
});

export const flowsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/flows
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["flows"],
      method: "get",
      path: "/",
      request: {
        query: querySchema,
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.union([z.array(flowSchema), flowsWithTotalsSchema]),
            },
          },
          description: "List of flows",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const {
        page,
        per_page,
        include_totals = false,
        sort,
        q,
      } = ctx.req.valid("query");

      const result = await ctx.env.data.flows.list(tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });

      if (!include_totals) {
        return ctx.json(result.flows);
      }

      return ctx.json(result);
    },
  )
  // --------------------------------
  // GET /api/v2/flows/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["flows"],
      method: "get",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: flowSchema,
            },
          },
          description: "A flow",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");

      const flow = await ctx.env.data.flows.get(tenant_id, id);
      if (!flow) {
        throw new HTTPException(404);
      }

      return ctx.json(flow);
    },
  )
  // --------------------------------
  // DELETE /api/v2/flows/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["flows"],
      method: "delete",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");

      const result = await ctx.env.data.flows.remove(tenant_id, id);
      if (!result) {
        throw new HTTPException(404, {
          message: "Flow not found",
        });
      }

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // PATCH /api/v2/flows/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["flows"],
      method: "patch",
      path: "/{id}",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(flowInsertSchema.shape).partial(),
            },
          },
        },
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: flowSchema,
            },
          },
          description: "The updated flow",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      const result = await ctx.env.data.flows.update(tenant_id, id, body);
      if (!result) {
        throw new HTTPException(404, {
          message: "Flow not found",
        });
      }

      const flow = await ctx.env.data.flows.get(tenant_id, id);
      if (!flow) {
        throw new HTTPException(404, {
          message: "Flow not found",
        });
      }

      return ctx.json(flow);
    },
  )
  // --------------------------------
  // POST /api/v2/flows
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["flows"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(flowInsertSchema.shape),
            },
          },
        },
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        201: {
          content: {
            "application/json": {
              schema: flowSchema,
            },
          },
          description: "The created flow",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const body = ctx.req.valid("json");

      const flowData = {
        ...body,
        id: generateFlowId(),
      };

      const flow = await ctx.env.data.flows.create(tenant_id, flowData);
      return ctx.json(flow, { status: 201 });
    },
  );
