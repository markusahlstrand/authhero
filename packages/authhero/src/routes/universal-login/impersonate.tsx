import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import ImpersonationPage from "../../components/ImpersonationPage";
import { HTTPException } from "hono/http-exception";
import { createFrontChannelAuthResponse } from "../../authentication-flows/common";
import MessagePage from "../../components/MessagePage";
import { logMessage } from "../../helpers/logging";

import { LogTypes } from "@authhero/adapter-interfaces";

export const impersonateRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/impersonate
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["impersonation"],
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
        200: {
          description: "Impersonation page",
        },
        400: {
          description: "Bad Request",
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");
      const { theme, branding, client, loginSession } = await initJSXRoute(
        ctx,
        state,
        true, // Allow session since we need it for impersonation
      );

      if (!loginSession.session_id) {
        throw new HTTPException(400, {
          message: "No session linked to login session",
        });
      }

      // Get the current session
      const session = await ctx.env.data.sessions.get(
        client.tenant.id,
        loginSession.session_id,
      );

      if (!session) {
        throw new HTTPException(400, { message: "Session not found" });
      }

      // Get the current user
      const user = await ctx.env.data.users.get(
        client.tenant.id,
        session.user_id,
      );

      if (!user) {
        throw new HTTPException(400, { message: "User not found" });
      }

      // Check if current user has impersonation permission
      const userPermissions = await ctx.env.data.userPermissions.list(
        client.tenant.id,
        user.user_id,
      );
      const hasImpersonationPermission = userPermissions.some(
        (perm) => perm.permission_name === "users:impersonate",
      );

      if (!hasImpersonationPermission) {
        return ctx.html(
          <MessagePage
            theme={theme}
            branding={branding}
            client={client}
            state={state}
            pageTitle="Access Denied"
            message="You do not have permission to impersonate other users."
          />,
          403,
        );
      }

      return ctx.html(
        <ImpersonationPage
          theme={theme}
          branding={branding}
          client={client}
          user={user}
          state={state}
        />,
      );
    },
  )
  // --------------------------------
  // POST /u/impersonate/continue
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["impersonation"],
      method: "post",
      path: "/continue",
      request: {
        query: z.object({
          state: z.string().openapi({
            description: "The state parameter from the authorization request",
          }),
        }),
      },
      responses: {
        302: {
          description: "Redirect to continue authentication flow",
          headers: z.object({ Location: z.string().url() }),
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");
      const { client, loginSession } = await initJSXRoute(ctx, state, true);

      if (!loginSession.session_id) {
        throw new HTTPException(400, {
          message: "No session linked to login session",
        });
      }

      // Get the current session
      const session = await ctx.env.data.sessions.get(
        client.tenant.id,
        loginSession.session_id,
      );

      if (!session) {
        throw new HTTPException(400, { message: "Session not found" });
      }

      // Get the current user
      const user = await ctx.env.data.users.get(
        client.tenant.id,
        session.user_id,
      );

      if (!user) {
        throw new HTTPException(400, { message: "User not found" });
      }

      // Check if current user has impersonation permission
      const userPermissions = await ctx.env.data.userPermissions.list(
        client.tenant.id,
        user.user_id,
      );
      const hasImpersonationPermission = userPermissions.some(
        (perm) => perm.permission_name === "users:impersonate",
      );

      if (!hasImpersonationPermission) {
        throw new HTTPException(403, {
          message: "Access denied: insufficient permissions",
        });
      }

      // Continue with the normal authentication flow
      return createFrontChannelAuthResponse(ctx, {
        client,
        authParams: loginSession.authParams,
        loginSession,
        user,
        sessionId: session.id,
        skipHooks: true, // Skip post-login hooks during impersonation
      });
    },
  )
  // --------------------------------
  // POST /u/impersonate/switch
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["impersonation"],
      method: "post",
      path: "/switch",
      request: {
        query: z.object({
          state: z.string().openapi({
            description: "The state parameter from the authorization request",
          }),
        }),
        body: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: z.object({
                user_id: z.string().min(1, "User ID is required"),
              }),
            },
          },
        },
      },
      responses: {
        302: {
          description:
            "Redirect to continue authentication flow as impersonated user",
          headers: z.object({ Location: z.string().url() }),
        },
        400: {
          description: "Bad Request - User not found or impersonation failed",
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");
      const { user_id } = ctx.req.valid("form");
      const { theme, branding, client, loginSession } = await initJSXRoute(
        ctx,
        state,
        true, // Allow session since we need it for impersonation
      );

      if (!loginSession.session_id) {
        throw new HTTPException(400, {
          message: "No session linked to login session",
        });
      }

      // Get the current session
      const currentSession = await ctx.env.data.sessions.get(
        client.tenant.id,
        loginSession.session_id,
      );

      if (!currentSession) {
        throw new HTTPException(400, { message: "Current session not found" });
      }

      // Get the current user to verify permissions
      const currentUser = await ctx.env.data.users.get(
        client.tenant.id,
        currentSession.user_id,
      );

      if (!currentUser) {
        throw new HTTPException(400, { message: "Current user not found" });
      }

      // Check if current user has impersonation permission
      const userPermissions = await ctx.env.data.userPermissions.list(
        client.tenant.id,
        currentUser.user_id,
      );
      const hasImpersonationPermission = userPermissions.some(
        (perm) => perm.permission_name === "users:impersonate",
      );

      if (!hasImpersonationPermission) {
        return ctx.html(
          <MessagePage
            theme={theme}
            branding={branding}
            client={client}
            state={state}
            pageTitle="Access Denied"
            message="You do not have permission to impersonate other users."
          />,
          403,
        );
      }

      // Get the target user to impersonate
      const targetUser = await ctx.env.data.users.get(
        client.tenant.id,
        user_id,
      );

      if (!targetUser) {
        return ctx.html(
          <ImpersonationPage
            theme={theme}
            branding={branding}
            client={client}
            user={currentUser}
            state={state}
            error={`User with ID "${user_id}" not found.`}
          />,
          400,
        );
      }

      // Update the existing session to point to the target user
      await ctx.env.data.sessions.update(client.tenant.id, currentSession.id, {
        user_id: targetUser.user_id,
      });

      // Log the impersonation as a login with the impersonating user in the description
      await logMessage(ctx, client.tenant.id, {
        type: LogTypes.SUCCESS_LOGIN,
        description: `${targetUser.email || targetUser.user_id} (impersonated by ${currentUser.email || currentUser.user_id})`,
        userId: targetUser.user_id,
        connection: targetUser.connection,
        strategy: targetUser.connection,
        strategy_type: targetUser.is_social ? "social" : "database",
      });

      // Continue with the authentication flow using the impersonated user
      // Use the original response_type and response_mode from the authorize request
      return createFrontChannelAuthResponse(ctx, {
        client,
        authParams: loginSession.authParams,
        loginSession,
        user: targetUser,
        sessionId: currentSession.id,
        skipHooks: true, // Skip post-login hooks during impersonation
        impersonatingUser: currentUser, // Set the act claim to identify the original user
      });
    },
  );
