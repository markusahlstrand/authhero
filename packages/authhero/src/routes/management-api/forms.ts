import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings } from "../../types";
import { HTTPException } from "hono/http-exception";
import { querySchema } from "../../types";
import {
  formInsertSchema,
  formSchema,
  totalsSchema,
} from "@authhero/adapter-interfaces";
import { parseSort } from "../../utils/sort";

const formsWithTotalsSchema = totalsSchema.extend({
  forms: z.array(formSchema),
});

export const formsRoutes = new OpenAPIHono<{ Bindings: Bindings }>()
  // --------------------------------
  // GET /api/v2/forms
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["forms"],
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
          Bearer: ["read:forms", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.union([z.array(formSchema), formsWithTotalsSchema]),
            },
          },
          description: "List of forms",
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
      const result = await ctx.env.data.forms.list(tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });
      if (!include_totals) {
        return ctx.json(result.forms);
      }
      return ctx.json(result);
    },
  )
  // --------------------------------
  // GET /api/v2/forms/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["forms"],
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
          Bearer: ["read:forms", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: formSchema,
            },
          },
          description: "A form",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");
      const form = await ctx.env.data.forms.get(tenant_id, id);
      if (!form) {
        throw new HTTPException(404);
      }
      return ctx.json(form);
    },
  )
  // --------------------------------
  // DELETE /api/v2/forms/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["forms"],
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
          Bearer: ["delete:forms", "auth:write"],
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
      const result = await ctx.env.data.forms.remove(tenant_id, id);
      if (!result) {
        throw new HTTPException(404, {
          message: "Form not found",
        });
      }
      return ctx.text("OK");
    },
  )
  // --------------------------------
  // PATCH /api/v2/forms/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["forms"],
      method: "patch",
      path: "/{id}",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(formInsertSchema.shape).partial(),
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
          Bearer: ["update:forms", "auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: formSchema,
            },
          },
          description: "The updated form",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");
      const result = await ctx.env.data.forms.update(tenant_id, id, body);
      if (!result) {
        throw new HTTPException(404, {
          message: "Form not found",
        });
      }
      const form = await ctx.env.data.forms.get(tenant_id, id);
      if (!form) {
        throw new HTTPException(404, {
          message: "Form not found",
        });
      }
      return ctx.json(form);
    },
  )
  // --------------------------------
  // POST /api/v2/forms
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["forms"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object(formInsertSchema.shape),
            },
          },
        },
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["create:forms", "auth:write"],
        },
      ],
      responses: {
        201: {
          content: {
            "application/json": {
              schema: formSchema,
            },
          },
          description: "A form",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const body = ctx.req.valid("json");
      const form = await ctx.env.data.forms.create(tenant_id, body);
      return ctx.json(form, { status: 201 });
    },
  );
