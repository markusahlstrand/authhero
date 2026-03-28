import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

// Auth0-compatible authentication method response schema
const authenticationMethodSchema = z.object({
  id: z.string(),
  type: z.string(),
  confirmed: z.boolean(),
  phone_number: z.string().optional(),
  created_at: z.string(),
});

const authenticationMethodsListSchema = z.array(authenticationMethodSchema);

const createAuthenticationMethodSchema = z.object({
  type: z.enum([
    "phone",
    "totp",
    "email",
    "push",
    "webauthn-roaming",
    "webauthn-platform",
    "passkey",
  ]),
  phone_number: z.string().optional(),
  totp_secret: z.string().optional(),
  confirmed: z.boolean().optional().default(true),
});

export const authenticationMethodsRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/users/:user_id/authentication-methods
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "get",
      path: "/",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
      },
      security: [
        {
          Bearer: ["read:users", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: authenticationMethodsListSchema,
            },
          },
          description: "List of authentication methods for the user",
        },
      },
    }),
    async (ctx) => {
      const userId = ctx.req.param("user_id");
      if (!userId) {
        throw new HTTPException(400, { message: "user_id is required" });
      }

      const enrollments = await ctx.env.data.authenticationMethods.list(
        ctx.var.tenant_id,
        userId,
      );

      const result = enrollments.map((e) => ({
        id: e.id,
        type: e.type,
        confirmed: e.confirmed,
        phone_number: e.phone_number,
        created_at: e.created_at,
      }));

      return ctx.json(result);
    },
  )
  // --------------------------------
  // POST /api/v2/users/:user_id/authentication-methods
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "post",
      path: "/",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
        body: {
          content: {
            "application/json": {
              schema: createAuthenticationMethodSchema,
            },
          },
        },
      },
      security: [
        {
          Bearer: ["update:users", "auth:write"],
        },
      ],
      responses: {
        201: {
          content: {
            "application/json": {
              schema: authenticationMethodSchema,
            },
          },
          description: "Created authentication method",
        },
      },
    }),
    async (ctx) => {
      const userId = ctx.req.param("user_id");
      if (!userId) {
        throw new HTTPException(400, { message: "user_id is required" });
      }

      const body = ctx.req.valid("json");

      const enrollment = await ctx.env.data.authenticationMethods.create(
        ctx.var.tenant_id,
        {
          user_id: userId,
          type: body.type,
          phone_number: body.phone_number,
          totp_secret: body.totp_secret,
          confirmed: body.confirmed ?? true,
        },
      );

      return ctx.json(
        {
          id: enrollment.id,
          type: enrollment.type,
          confirmed: enrollment.confirmed,
          phone_number: enrollment.phone_number,
          created_at: enrollment.created_at,
        },
        201,
      );
    },
  )
  // --------------------------------
  // GET /api/v2/users/:user_id/authentication-methods/:method_id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "get",
      path: "/{method_id}",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
        params: z.object({
          method_id: z.string(),
        }),
      },
      security: [
        {
          Bearer: ["read:users", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: authenticationMethodSchema,
            },
          },
          description: "Authentication method details",
        },
      },
    }),
    async (ctx) => {
      const { method_id } = ctx.req.valid("param");
      const userId = ctx.req.param("user_id");

      const enrollment = await ctx.env.data.authenticationMethods.get(
        ctx.var.tenant_id,
        method_id,
      );

      if (!enrollment || enrollment.user_id !== userId) {
        throw new HTTPException(404, {
          message: "Authentication method not found",
        });
      }

      return ctx.json({
        id: enrollment.id,
        type: enrollment.type,
        confirmed: enrollment.confirmed,
        phone_number: enrollment.phone_number,
        created_at: enrollment.created_at,
      });
    },
  )
  // --------------------------------
  // DELETE /api/v2/users/:user_id/authentication-methods/:method_id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "delete",
      path: "/{method_id}",
      request: {
        headers: z.object({
          "tenant-id": z.string().optional(),
        }),
        params: z.object({
          method_id: z.string(),
        }),
      },
      security: [
        {
          Bearer: ["update:users", "auth:write"],
        },
      ],
      responses: {
        204: {
          description: "Authentication method deleted",
        },
      },
    }),
    async (ctx) => {
      const { method_id } = ctx.req.valid("param");
      const userId = ctx.req.param("user_id");

      const enrollment = await ctx.env.data.authenticationMethods.get(
        ctx.var.tenant_id,
        method_id,
      );

      if (!enrollment || enrollment.user_id !== userId) {
        throw new HTTPException(404, {
          message: "Authentication method not found",
        });
      }

      const deleted = await ctx.env.data.authenticationMethods.remove(
        ctx.var.tenant_id,
        method_id,
      );

      if (!deleted) {
        throw new HTTPException(404, {
          message: "Authentication method not found",
        });
      }

      return ctx.body(null, 204);
    },
  );
