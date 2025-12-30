import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { querySchema } from "../../types";
import {
  customDomainInsertSchema,
  customDomainSchema,
} from "@authhero/adapter-interfaces";

export const customDomainRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/custom-domains
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["custom-domains"],
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
          Bearer: ["read:custom_domains", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.array(customDomainSchema),
            },
          },
          description: "List of custom domains",
        },
      },
    }),
    async (ctx) => {
      const result = await ctx.env.data.customDomains.list(ctx.var.tenant_id);

      return ctx.json(result);
    },
  )
  // --------------------------------
  // GET /api/v2/custom-domains/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["custom-domains"],
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
          Bearer: ["read:custom_domains", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: customDomainSchema,
            },
          },
          description: "A customDomain",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      const customDomain = await ctx.env.data.customDomains.get(
        ctx.var.tenant_id,
        id,
      );

      if (!customDomain) {
        throw new HTTPException(404);
      }

      return ctx.json(customDomain);
    },
  )
  // --------------------------------
  // DELETE /api/v2/custom-domains/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["custom-domains"],
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
          Bearer: ["delete:custom_domains", "auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");

      const result = await ctx.env.data.customDomains.remove(
        ctx.var.tenant_id,
        id,
      );
      if (!result) {
        throw new HTTPException(404, {
          message: "Custom domain not found",
        });
      }

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // PATCH /api/v2/custom-domains/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["custom-domains"],
      method: "patch",
      path: "/{id}",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(customDomainSchema.shape).partial(),
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
          Bearer: ["update:custom_domains", "auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: customDomainSchema,
            },
          },
          description: "The updated custom domain",
        },
      },
    }),
    async (ctx) => {
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      const result = await ctx.env.data.customDomains.update(
        ctx.var.tenant_id,
        id,
        body,
      );
      if (!result) {
        throw new HTTPException(404);
      }

      const customDomain = await ctx.env.data.customDomains.get(
        ctx.var.tenant_id,
        id,
      );

      if (!customDomain) {
        throw new HTTPException(404);
      }

      return ctx.json(customDomain);
    },
  )
  // --------------------------------
  // POST /api/v2/custom-domains
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["custom-domains"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(customDomainInsertSchema.shape),
            },
          },
        },
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["create:custom_domains", "auth:write"],
        },
      ],
      responses: {
        201: {
          content: {
            "application/json": {
              schema: customDomainSchema,
            },
          },
          description: "The created custom domain",
        },
      },
    }),
    async (ctx) => {
      const body = ctx.req.valid("json");

      const customDomain = await ctx.env.data.customDomains.create(
        ctx.var.tenant_id,
        body,
      );

      return ctx.json(customDomain, { status: 201 });
    },
  )
  // --------------------------------
  // POST /api/v2/custom-domains/:id/verify
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["custom-domains"],
      method: "post",
      path: "/{id}/verify",
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
          Bearer: ["update:custom_domains", "auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: customDomainSchema,
            },
          },
          description: "The custom domain",
        },
      },
    }),
    async () => {
      throw new HTTPException(501, {
        message: "Not implemented",
      });
    },
  );
