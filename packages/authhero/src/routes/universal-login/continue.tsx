import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRouteWithSession } from "./common";
import { createFrontChannelAuthResponse } from "../../authentication-flows/common";
import { continuePostLogin } from "../../hooks";

/**
 * Continue route - Auth0-style endpoint that resumes the login flow after a redirect action.
 *
 * When a post-login hook (onExecutePostLogin, form, or page hook) issues a redirect,
 * the Actions pipeline is suspended. After the user completes the external action,
 * they are redirected back to /continue to resume the pipeline.
 *
 * This endpoint:
 * 1. Validates the login session state
 * 2. Calls onContinuePostLogin if the redirect was from a code hook
 * 3. Completes the authentication flow by issuing tokens
 *
 * @see https://auth0.com/docs/customize/actions/flows-and-triggers/login-flow/redirect-with-actions
 */
export const continueRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/continue
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
          description: "Redirect to the application with auth code/tokens",
          headers: z.object({ Location: z.string().url() }),
        },
        400: {
          description: "Bad Request - missing or invalid state",
        },
        403: {
          description: "Access denied by onContinuePostLogin hook",
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");

      // Get the session info - this validates that the user has a valid login session
      const { client, user, loginSession } = await initJSXRouteWithSession(
        ctx,
        state,
        { skipPipelineCheck: true }, // Continue endpoint handles pipeline state
      );

      // Resume the pipeline by calling onContinuePostLogin (Auth0-style)
      const continueResult = await continuePostLogin(
        ctx,
        ctx.env.data,
        client.tenant.id,
        user,
        loginSession,
        {
          client,
          authParams: loginSession.authParams,
        },
      );

      // If continuePostLogin returned a Response (e.g., access denied redirect), return it
      if (continueResult instanceof Response) {
        return continueResult;
      }

      // Refetch loginSession to capture any mutations made by continuePostLogin
      // (e.g., custom claims stored in pipeline_state.context by onContinuePostLogin)
      const updatedLoginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        loginSession.id,
      );

      // Complete the authentication flow with the (possibly updated) user
      // skipHooks: true because we don't want to re-run onExecutePostLogin
      return createFrontChannelAuthResponse(ctx, {
        authParams: loginSession.authParams,
        client,
        user: continueResult,
        loginSession: updatedLoginSession || loginSession,
        skipHooks: true,
      });
    },
  )
  // --------------------------------
  // POST /u/continue
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "post",
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
          description: "Redirect to the application with auth code/tokens",
          headers: z.object({ Location: z.string().url() }),
        },
        400: {
          description: "Bad Request - missing or invalid state",
        },
        403: {
          description: "Access denied by onContinuePostLogin hook",
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");

      // Get the session info
      const { client, user, loginSession } = await initJSXRouteWithSession(
        ctx,
        state,
        { skipPipelineCheck: true }, // Continue endpoint handles pipeline state
      );

      // Resume the pipeline
      const continueResult = await continuePostLogin(
        ctx,
        ctx.env.data,
        client.tenant.id,
        user,
        loginSession,
        {
          client,
          authParams: loginSession.authParams,
        },
      );

      if (continueResult instanceof Response) {
        return continueResult;
      }

      // Refetch loginSession to capture any mutations made by continuePostLogin
      // (e.g., custom claims stored in pipeline_state.context by onContinuePostLogin)
      const updatedLoginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        loginSession.id,
      );

      return createFrontChannelAuthResponse(ctx, {
        authParams: loginSession.authParams,
        client,
        user: continueResult,
        loginSession: updatedLoginSession || loginSession,
        skipHooks: true,
      });
    },
  );
