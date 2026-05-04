import { LogTypes } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { logMessage, logMessageInTx } from "../../helpers/logging";
import { Bindings, Variables } from "../../types";
import { clearAuthCookie, getAuthCookie } from "../../utils/cookies";
import { setTenantId } from "../../helpers/set-tenant-id";
import { getEnrichedClient } from "../../helpers/client";
import { validateJwtToken } from "../../utils/jwt";

// OIDC RP-Initiated Logout 1.0
// https://openid.net/specs/openid-connect-rpinitiated-1_0.html
//
// Differences from /v2/logout:
//  * Accepts `id_token_hint` (signed JWT) in addition to plain `client_id`.
//  * Echoes back the `state` parameter on the post-logout redirect.
//  * Refuses to redirect when the post_logout_redirect_uri isn't registered
//    (rather than 400-ing immediately, we still clear the session and render
//    a generic success page — matches what most OPs do and avoids leaking
//    tenant/client existence to drive-by callers).

const querySchema = z.object({
  id_token_hint: z.string().optional(),
  client_id: z.string().optional(),
  post_logout_redirect_uri: z.string().optional(),
  state: z.string().optional(),
  logout_hint: z.string().optional(),
  ui_locales: z.string().optional(),
});

const LOGGED_OUT_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Logged out</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f7f7f8; color: #111; }
      main { max-width: 28rem; padding: 2rem; background: white; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); text-align: center; }
      h1 { margin: 0 0 0.5rem; font-size: 1.25rem; }
      p { margin: 0; color: #555; }
    </style>
  </head>
  <body>
    <main>
      <h1>You are signed out</h1>
      <p>It is now safe to close this window.</p>
    </main>
  </body>
</html>`;

export const oidcLogoutRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapi(
  createRoute({
    tags: ["oauth2"],
    method: "get",
    path: "/",
    request: {
      query: querySchema,
      header: z.object({
        cookie: z.string().optional(),
      }),
    },
    responses: {
      200: { description: "Logout completed without redirect" },
      302: { description: "Redirect to post_logout_redirect_uri" },
      400: { description: "Invalid request" },
    },
  }),
  async (ctx) => {
    const {
      id_token_hint,
      client_id: clientIdParam,
      post_logout_redirect_uri,
      state,
    } = ctx.req.valid("query");

    let resolvedClientId: string | undefined;
    let idTokenSub: string | undefined;
    let idTokenSid: string | undefined;

    if (id_token_hint) {
      let payload;
      try {
        payload = await validateJwtToken(ctx, id_token_hint);
      } catch {
        // OIDC spec: "The OP MUST validate the signature... If the signature
        // is not valid, the OP MUST NOT log out the user".
        throw new HTTPException(400, { message: "Invalid id_token_hint" });
      }
      const aud = payload.aud;
      resolvedClientId = Array.isArray(aud) ? aud[0] : aud;
      idTokenSub = payload.sub;
      idTokenSid = (payload as Record<string, unknown>).sid as
        | string
        | undefined;

      if (clientIdParam && clientIdParam !== resolvedClientId) {
        throw new HTTPException(400, {
          message: "client_id does not match id_token_hint",
        });
      }
    } else if (clientIdParam) {
      resolvedClientId = clientIdParam;
    }

    let client;
    if (resolvedClientId) {
      try {
        client = await getEnrichedClient(ctx.env, resolvedClientId);
        ctx.set("client_id", resolvedClientId);
        setTenantId(ctx, client.tenant.id);
      } catch {
        // Unknown client — fall through and render the generic success page
        // without a redirect. This mirrors /v2/logout's "swallow unknown
        // client" behaviour and avoids enumeration.
        client = undefined;
      }
    }

    let redirectTarget: string | undefined;
    if (post_logout_redirect_uri) {
      // OIDC RP-Initiated Logout 1.0 §2 mandates Simple String Comparison
      // (RFC 3986 §6.2.1) — exact-match including query/fragment. Path/
      // subdomain wildcards (used by /v2/logout) are explicitly NOT allowed
      // here, otherwise an RP could append `?foo=bar` to a registered URI
      // and bypass the registration check.
      const allowed = client?.allowed_logout_urls ?? [];
      if (client && allowed.includes(post_logout_redirect_uri)) {
        redirectTarget = post_logout_redirect_uri;
      } else if (client) {
        logMessage(ctx, client.tenant.id, {
          type: LogTypes.FAILED_LOGOUT,
          description: "Invalid post_logout_redirect_uri",
        });
        throw new HTTPException(400, {
          message: "Invalid post_logout_redirect_uri",
        });
      } else {
        // No way to validate — refuse to redirect. Continue to clear cookies.
        throw new HTTPException(400, {
          message:
            "post_logout_redirect_uri requires id_token_hint or client_id",
        });
      }
    }

    if (idTokenSub && client) {
      ctx.set("user_id", idTokenSub);
    }

    const cookieHeader = ctx.req.header("cookie");
    if (client && cookieHeader) {
      const sessionId = getAuthCookie(client.tenant.id, cookieHeader);
      const targetSessionId = idTokenSid ?? sessionId;
      if (targetSessionId) {
        const session = await ctx.env.data.sessions.get(
          client.tenant.id,
          targetSessionId,
        );
        if (session) {
          if (!ctx.var.user_id) {
            const user = await ctx.env.data.users.get(
              client.tenant.id,
              session.user_id,
            );
            if (user) {
              ctx.set("user_id", user.user_id);
              ctx.set("connection", user.connection);
            }
          }

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

              await trx.sessions.update(client.tenant.id, targetSessionId, {
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
            const promises = ctx.var.outboxEventPromises ?? [];
            promises.push(Promise.resolve(committedEventId));
            ctx.set("outboxEventPromises", promises);
          } else if (revokedCount > 0) {
            logMessage(ctx, client.tenant.id, {
              type: LogTypes.SUCCESS_REVOCATION,
              description: `Revoked ${revokedCount} refresh token(s)`,
            });
          }
        }
      }
    }

    if (client) {
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.SUCCESS_LOGOUT,
        description: "User successfully logged out",
      });
    }

    const headers = new Headers();
    if (client) {
      const clearCookies = clearAuthCookie(client.tenant.id, ctx.var.host);
      clearCookies.forEach((c) => headers.append("set-cookie", c));
    }

    if (redirectTarget) {
      // Preserve any query string the RP sent (e.g. ?foo=bar) and append
      // state. URL.searchParams.set replaces, not appends, so a duplicate
      // `state` parameter from the RP gets clobbered — which matches what
      // the spec expects since `state` is reserved for the OP to echo back.
      let location: string;
      try {
        const url = new URL(redirectTarget);
        if (state !== undefined) {
          url.searchParams.set("state", state);
        }
        location = url.toString();
      } catch {
        throw new HTTPException(400, {
          message: "Invalid post_logout_redirect_uri",
        });
      }
      headers.set("location", location);
      return new Response("Redirecting", { status: 302, headers });
    }

    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(LOGGED_OUT_HTML, { status: 200, headers });
  },
);
