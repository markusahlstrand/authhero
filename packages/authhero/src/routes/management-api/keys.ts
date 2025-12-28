import { Bindings } from "../../types";
import { createX509Certificate } from "../../utils/encryption";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { signingKeySchema } from "@authhero/adapter-interfaces";

const DAY = 1000 * 60 * 60 * 24;

export const keyRoutes = new OpenAPIHono<{ Bindings: Bindings }>()
  // --------------------------------
  // GET /keys
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["keys"],
      method: "get",
      path: "/signing",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["read:keys", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.array(signingKeySchema),
            },
          },
          description: "List of keys",
        },
      },
    }),
    async (ctx) => {
      const { signingKeys } = await ctx.env.data.keys.list({
        q: "type:jwt_signing",
      });

      const keys = signingKeys
        .filter((key: any) => "cert" in key)
        .map((key: any) => {
          return key;
        });

      return ctx.json(keys);
    },
  )
  // --------------------------------
  // GET /keys/signing/:kid
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["keys"],
      method: "get",
      path: "/signing/{kid}",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        params: z.object({
          kid: z.string(),
        }),
      },
      security: [
        {
          Bearer: ["read:keys", "auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: signingKeySchema,
            },
          },
          description: "The requested key",
        },
      },
    }),
    async (ctx) => {
      const { kid } = ctx.req.valid("param");

      const { signingKeys } = await ctx.env.data.keys.list({
        q: "type:jwt_signing",
      });
      const key = signingKeys.find((k: any) => k.kid === kid);
      if (!key) {
        throw new HTTPException(404, { message: "Key not found" });
      }

      return ctx.json(key);
    },
  )
  // --------------------------------
  // POST /keys/signing/rotate
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["keys"],
      method: "post",
      path: "/signing/rotate",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["create:keys", "auth:write"],
        },
      ],
      responses: {
        201: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { signingKeys } = await ctx.env.data.keys.list({
        q: "type:jwt_signing",
      });
      for await (const key of signingKeys) {
        await ctx.env.data.keys.update(key.kid, {
          revoked_at: new Date(Date.now() + DAY).toISOString(),
        });
      }

      const signingKey = await createX509Certificate({
        name: `CN=${ctx.env.ORGANIZATION_NAME}`,
      });

      await ctx.env.data.keys.create({ ...signingKey, type: "jwt_signing" });

      return ctx.text("OK", { status: 201 });
    },
  )
  // --------------------------------
  // PUT /signing/:kid/revoke
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["keys"],
      method: "put",
      path: "/signing/{kid}/revoke",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        params: z.object({
          kid: z.string(),
        }),
      },
      security: [
        {
          Bearer: ["update:keys", "auth:write"],
        },
      ],
      responses: {
        201: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { kid } = ctx.req.valid("param");

      const revoked = await ctx.env.data.keys.update(kid, {
        revoked_at: new Date().toISOString(),
      });
      if (!revoked) {
        throw new HTTPException(404, { message: "Key not found" });
      }

      const signingKey = await createX509Certificate({
        name: `CN=${ctx.env.ORGANIZATION_NAME}`,
      });

      await ctx.env.data.keys.create({ ...signingKey, type: "jwt_signing" });

      return ctx.text("OK");
    },
  );
