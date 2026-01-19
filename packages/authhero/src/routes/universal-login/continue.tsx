import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import {
  createFrontChannelAuthResponse,
  completeLoginSessionContinuation,
} from "../../authentication-flows/common";
import { LoginSessionState } from "@authhero/adapter-interfaces";

export const continueRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/continue
  // Resumes the login flow after a redirect to an account page (e.g., change-email)
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "get",
      path: "/",
      request: {
        query: z.object({
          state: z.string().openapi({
            description: "The state parameter from the authorization request",
          }),
        }),
      },
      responses: {
        302: {
          description:
            "Redirect to continue authentication flow (e.g., to client redirect_uri)",
          headers: z.object({
            Location: z.string(),
          }),
        },
        400: {
          description: "Bad Request - Invalid state or session",
        },
        500: {
          description: "Internal Server Error",
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");

      const { client, loginSession } = await initJSXRoute(ctx, state, true);

      if (!client || !client.tenant?.id) {
        console.error("Client or tenant ID missing in GET /u/continue");
        return ctx.text("Configuration error", 500);
      }

      // Only handle AWAITING_CONTINUATION state - the expected state after a hook redirect
      if (loginSession.state !== LoginSessionState.AWAITING_CONTINUATION) {
        console.warn(
          `Continue endpoint called but session ${loginSession.id} is in unexpected state ${loginSession.state}`,
        );
        return ctx.redirect(
          `/u/login/identifier?state=${encodeURIComponent(state)}`,
        );
      }

      await completeLoginSessionContinuation(
        ctx,
        client.tenant.id,
        loginSession,
      );

      // Get user from session
      if (!loginSession.session_id) {
        console.error("No session_id in login session during continue");
        return ctx.redirect(
          `/u/login/identifier?state=${encodeURIComponent(state)}`,
        );
      }

      const session = await ctx.env.data.sessions.get(
        client.tenant.id,
        loginSession.session_id,
      );

      if (!session?.user_id) {
        console.error("No user_id in session during continue");
        return ctx.redirect(
          `/u/login/identifier?state=${encodeURIComponent(state)}`,
        );
      }

      const user = await ctx.env.data.users.get(
        client.tenant.id,
        session.user_id,
      );

      if (!user) {
        console.error("User not found during continue");
        return ctx.redirect(
          `/u/login/identifier?state=${encodeURIComponent(state)}`,
        );
      }

      // Create auth response to complete the flow
      const result = await createFrontChannelAuthResponse(ctx, {
        authParams: loginSession.authParams,
        client,
        user,
        loginSession,
        skipHooks: true, // Skip hooks since we're resuming after a hook redirect
      });

      return result;
    },
  );
