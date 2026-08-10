import { LogTypes } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { logMessage } from "../../helpers/logging";
import { Bindings, Variables } from "../../types";
import { isValidRedirectUrl } from "../../utils/is-valid-redirect-url";
import { clearAuthCookie, getAuthCookie } from "../../utils/cookies";
import { setTenantId } from "../../helpers/set-tenant-id";
import { getEnrichedClient } from "../../helpers/client";
import { prefetchClientBundle } from "../../helpers/prefetch-client-bundle";
import { isCimdClientId } from "../../helpers/cimd";
import { sendBackchannelLogout } from "../../helpers/backchannel-logout";
import { defineRoute } from "../../utils/define-route";
const getRoot = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
    const { client_id, returnTo } = ctx.req.valid("query");

    if (!isCimdClientId(client_id)) {
      await prefetchClientBundle(ctx, { client_id }).catch(() => {});
    }

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
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_LOGOUT,
        description: "Invalid redirect uri",
      });
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

          // Front-channel logout ends the browser session only. Refresh
          // tokens are grants, not sessions — the auth cookie is shared by
          // every client on the tenant, so cascading revocation here would
          // kill other clients' tokens (and this endpoint is an
          // unauthenticated GET). Auth0 behaves the same; clients revoke
          // their own tokens via POST /oauth/revoke (RFC 7009).
          await ctx.env.data.sessions.update(client.tenant.id, tokenState, {
            revoked_at: new Date().toISOString(),
          });

          sendBackchannelLogout(ctx, client.tenant.id, session);
        }
      }
    }
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.SUCCESS_LOGOUT,
      description: "User successfully logged out",
    });

    const headers = new Headers();
    const clearCookies = clearAuthCookie(client.tenant.id, ctx.var.host);
    clearCookies.forEach((cookie) => {
      headers.append("set-cookie", cookie);
    });
    headers.set("location", redirectUri);

    return new Response("Redirecting", {
      status: 302,
      headers,
    });
  },
});

export const logoutRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getRoot] as const);
