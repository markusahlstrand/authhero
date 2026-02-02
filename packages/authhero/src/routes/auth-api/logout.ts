import { LogTypes } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { logMessage } from "../../helpers/logging";
import { Bindings, Variables } from "../../types";
import { isValidRedirectUrl } from "../../utils/is-valid-redirect-url";
import { clearAuthCookie, getAuthCookie } from "../../utils/cookies";
import { setTenantId } from "../../helpers/set-tenant-id";
import { getEnrichedClient } from "../../helpers/client";

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

      let client;
      try {
        client = await getEnrichedClient(ctx.env, client_id);
      } catch {
        return ctx.text("OK");
      }

      // A temporary solution to handle cross tenant clients
      let defaultClient;
      try {
        defaultClient = await getEnrichedClient(ctx.env, "DEFAULT_CLIENT");
      } catch {
        // DEFAULT_CLIENT may not exist
      }

      ctx.set("client_id", client_id);
      setTenantId(ctx, client.tenant.id);

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
          { allowPathWildcards: true, allowSubDomainWildcards: true },
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
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.SUCCESS_LOGOUT,
        description: "User successfully logged out",
      });

      const headers = new Headers();
      const clearCookies = clearAuthCookie(
        client.tenant.id,
        ctx.var.custom_domain || ctx.req.header("host"),
      );
      clearCookies.forEach((cookie) => {
        headers.append("set-cookie", cookie);
      });
      headers.set("location", redirectUri);

      return new Response("Redirecting", {
        status: 302,
        headers,
      });
    },
  );
