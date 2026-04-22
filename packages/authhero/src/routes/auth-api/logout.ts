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

            // Soft-revoke every refresh token bound to this login session in
            // a single UPDATE + mark session revoked + write the
            // SUCCESS_REVOCATION audit event atomically. The outbox insert
            // commits with the state changes, so we never emit a success
            // event for tokens that weren't actually revoked.
            const revokedAt = new Date().toISOString();
            const { revokedCount, committedEventId } =
              await ctx.env.data.transaction(async (trx) => {
                const count = session.login_session_id
                  ? await trx.refreshTokens.revokeByLoginSession(
                      client.tenant.id,
                      session.login_session_id,
                      revokedAt,
                    )
                  : 0;

                await trx.sessions.update(client.tenant.id, tokenState, {
                  revoked_at: revokedAt,
                });

                const eventId =
                  count > 0
                    ? await logMessageInTx(ctx, trx, client.tenant.id, {
                        type: LogTypes.SUCCESS_REVOCATION,
                        description: `Revoked ${count} refresh token(s)`,
                      })
                    : undefined;

                return { revokedCount: count, committedEventId: eventId };
              });

            if (committedEventId) {
              // Feed the already-committed event id into the outbox middleware
              // so destination delivery is still scheduled.
              const promises = ctx.var.outboxEventPromises ?? [];
              promises.push(Promise.resolve(committedEventId));
              ctx.set("outboxEventPromises", promises);
            } else if (revokedCount > 0) {
              // logMessageInTx returned undefined — either outbox is disabled
              // or the transaction-scoped outbox adapter is unavailable. Emit
              // the legacy log so the revocation is still recorded.
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
