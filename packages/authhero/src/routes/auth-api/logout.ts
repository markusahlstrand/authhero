import { LogTypes } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { logMessage, logMessageInTx } from "../../helpers/logging";
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

            // Find refresh tokens via login_session_id
            const refreshTokensList = session.login_session_id
              ? await ctx.env.data.refreshTokens.list(client.tenant.id, {
                  q: `login_id=${session.login_session_id}`,
                  page: 0,
                  per_page: 100,
                  include_totals: false,
                })
              : null;

            const revokedCount =
              refreshTokensList?.refresh_tokens.length ?? 0;

            // Revoke refresh tokens + mark session revoked + write the
            // SUCCESS_REVOCATION audit event atomically. The outbox insert
            // commits with the state changes, so we never emit a success
            // event for tokens that weren't actually revoked.
            const committedEventId = await ctx.env.data.transaction(
              async (trx) => {
                if (refreshTokensList && revokedCount > 0) {
                  await Promise.all(
                    refreshTokensList.refresh_tokens.map((refreshToken) =>
                      trx.refreshTokens.remove(
                        client.tenant.id,
                        refreshToken.id,
                      ),
                    ),
                  );
                }

                await trx.sessions.update(client.tenant.id, tokenState, {
                  revoked_at: new Date().toISOString(),
                });

                if (revokedCount > 0) {
                  return logMessageInTx(ctx, trx, client.tenant.id, {
                    type: LogTypes.SUCCESS_REVOCATION,
                    description: `Revoked ${revokedCount} refresh token(s)`,
                  });
                }
                return undefined;
              },
            );

            if (committedEventId) {
              // Feed the already-committed event id into the outbox middleware
              // so destination delivery is still scheduled.
              const promises = ctx.var.outboxEventPromises ?? [];
              promises.push(Promise.resolve(committedEventId));
              ctx.set("outboxEventPromises", promises);
            } else if (revokedCount > 0 && !ctx.env.outbox?.enabled) {
              // Outbox disabled: emit the legacy log so non-outbox deployments
              // still see the revocation.
              logMessage(ctx, client.tenant.id, {
                type: LogTypes.SUCCESS_REVOCATION,
                description: `Revoked ${revokedCount} refresh token(s)`,
              });
            }
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
  );
