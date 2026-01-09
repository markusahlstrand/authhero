import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";

const userInfoSchema = z.object({
  sub: z.string(),
  email: z.string().optional(),
  family_name: z.string().optional(),
  given_name: z.string().optional(),
  email_verified: z.boolean(),
});

export const userinfoRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /userinfo
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["oauth2"],
      method: "get",
      path: "/",
      request: {},
      security: [
        {
          Bearer: ["openid"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: userInfoSchema,
            },
          },
          description: "Userinfo",
        },
      },
    }),
    async (ctx) => {
      if (!ctx.var.user) {
        throw new HTTPException(404, { message: "User not found 1" });
      }

      // Get tenant_id from token or fallback to context (from tenant middleware)
      const tenant_id = ctx.var.user.tenant_id || ctx.var.tenant_id;
      if (!tenant_id) {
        throw new HTTPException(400, { message: "Unable to determine tenant" });
      }

      const user = await ctx.env.data.users.get(tenant_id, ctx.var.user.sub);

      if (!user) {
        throw new HTTPException(404, { message: "User not found" });
      }

      // Build initial userinfo response
      const baseUserInfo = userInfoSchema.parse({
        ...user,
        sub: user.user_id,
      });

      // Call onFetchUserInfo hook if configured
      const onFetchUserInfo = ctx.env.hooks?.onFetchUserInfo;
      if (onFetchUserInfo) {
        const customClaims: Record<string, unknown> = {};

        // Get scope from token payload (ctx.var.user contains full JWT payload)
        const tokenPayload = ctx.var.user;
        const scopes = tokenPayload?.scope?.split(" ") || [];

        await onFetchUserInfo(
          {
            ctx,
            user,
            tenant_id,
            scopes,
          },
          {
            setCustomClaim: (claim: string, value: unknown) => {
              customClaims[claim] = value;
            },
          },
        );

        // Merge custom claims into userinfo (custom claims override base)
        // Return as generic JSON since custom claims extend the schema
        return ctx.json({ ...baseUserInfo, ...customClaims });
      }

      return ctx.json(baseUserInfo);
    },
  );
