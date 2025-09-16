import { LogTypes } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { createLogMessage } from "../../utils/create-log-message";
import { Bindings, Variables } from "../../types";
import { isValidRedirectUrl } from "../../utils/is-valid-redirect-url";
import { clearAuthCookie, getAuthCookie } from "../../utils/cookies";

export const logoutRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /v2/logout
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["oauth2"],
      method: "get",
      path: "/",
      request: {
        query: z.object({
          client_id: z.string(),
          returnTo: z.string().optional(),
        }),
        header: z.object({
          cookie: z.string().optional(),
        }),
      },
      responses: {
        302: {
          description: "Log the user out",
        },
      },
    }),
    async (ctx) => {
      const { client_id, returnTo } = ctx.req.valid("query");

      const client = await ctx.env.data.legacyClients.get(client_id);
      if (!client) {
        return ctx.text("OK");
      }

      // A temporary solution to handle cross tenant clients
      const defaultClient =
        await ctx.env.data.legacyClients.get("DEFAULT_CLIENT");

      ctx.set("client_id", client_id);
      ctx.set("tenant_id", client.tenant.id);

      const redirectUri = returnTo || ctx.req.header("referer");
      if (!redirectUri) {
        return ctx.text("OK");
      }

      if (
        !isValidRedirectUrl(
          redirectUri,
          [
            ...(client.allowed_logout_urls || []),
            ...(defaultClient?.allowed_logout_urls || []),
          ],
          { allowPathWildcards: true },
        )
      ) {
        throw new HTTPException(400, {
          message: "Invalid redirect uri",
        });
      }

      const cookie = ctx.req.header("cookie");

      if (cookie) {
        const tokenState = getAuthCookie(client.tenant.id, cookie);
        if (tokenState) {
          const session = await ctx.env.data.sessions.get(
            client.tenant.id,
            tokenState,
          );
          if (session) {
            const user = await ctx.env.data.users.get(
              client.tenant.id,
              session.user_id,
            );
            if (user) {
              ctx.set("user_id", user.user_id);
              ctx.set("connection", user.connection);
            }

            const refreshTokens = await ctx.env.data.refreshTokens.list(
              client.tenant.id,
              {
                q: `session_id=${tokenState}`,
                page: 0,
                per_page: 100,
                include_totals: false,
              },
            );

            // Remove all refresh tokens
            await Promise.all(
              refreshTokens.refresh_tokens.map((refreshToken) =>
                ctx.env.data.refreshTokens.remove(
                  client.tenant.id,
                  refreshToken.id,
                ),
              ),
            );

            await ctx.env.data.sessions.update(client.tenant.id, tokenState, {
              revoked_at: new Date().toISOString(),
            });
          }
        }
      }
      const log = createLogMessage(ctx, {
        type: LogTypes.SUCCESS_LOGOUT,
        description: "User successfully logged out",
      });

      await ctx.env.data.logs.create(client.tenant.id, log);

      return new Response("Redirecting", {
        status: 302,
        headers: {
          "set-cookie": clearAuthCookie(
            client.tenant.id,
            ctx.req.header("host"),
          ),
          location: redirectUri,
        },
      });
    },
  );
