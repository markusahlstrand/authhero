/**
 * Impersonate screen - allows users with impersonation permission to
 * continue as themselves or switch to another user
 *
 * Corresponds to: /u2/impersonate
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { HTTPException } from "hono/http-exception";
import { escapeHtml } from "../sanitization-utils";
import {
  createFrontChannelAuthResponse,
  completeLoginSessionHook,
} from "../../../authentication-flows/common";
import { logMessage } from "../../../helpers/logging";
import { LogTypes } from "@authhero/adapter-interfaces";

/**
 * Create the impersonate screen
 */
export async function impersonateScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const {
    ctx,
    tenant,
    client,
    branding,
    state,
    errors,
    routePrefix = "/u2",
  } = context;

  // Get login session
  const loginSession = await ctx.env.data.loginSessions.get(tenant.id, state);
  if (!loginSession) {
    throw new HTTPException(400, { message: "Login session not found" });
  }

  if (!loginSession.session_id) {
    throw new HTTPException(400, {
      message: "No session linked to login session",
    });
  }

  // Get the current session
  const session = await ctx.env.data.sessions.get(
    tenant.id,
    loginSession.session_id,
  );

  if (!session) {
    throw new HTTPException(400, { message: "Session not found" });
  }

  // Get the current user
  const user = await ctx.env.data.users.get(tenant.id, session.user_id);

  if (!user) {
    throw new HTTPException(400, { message: "User not found" });
  }

  // Check if current user has impersonation permission
  const userPermissions = await ctx.env.data.userPermissions.list(
    tenant.id,
    user.user_id,
  );
  const hasImpersonationPermission = userPermissions.some(
    (perm) => perm.permission_name === "users:impersonate",
  );

  if (!hasImpersonationPermission) {
    // Return an error screen
    const errorScreen: UiScreen = {
      name: "impersonate",
      // Action points to HTML endpoint for no-JS fallback
      action: `${routePrefix}/impersonate?state=${encodeURIComponent(state)}`,
      method: "POST",
      title: "Access Denied",
      description: "You do not have permission to impersonate other users.",
      components: [],
      messages: [
        {
          id: 1,
          text: "You do not have permission to impersonate other users.",
          type: "error",
        },
      ],
    };

    return {
      screen: errorScreen,
      branding,
    };
  }

  // Mirrors the classic /u/impersonate page: a primary "Continue" that keeps
  // the signed-in user, and a separate box for switching to another user.
  // Both buttons submit the same form; the handler tells them apart by the
  // button id the widget posts (`continue` / `impersonate`).
  const components: FormNodeComponent[] = [
    {
      id: "current-user",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<p>Current user: <strong>${escapeHtml(user.email || user.user_id)}</strong></p>`,
      },
      order: 0,
    },
    {
      id: "continue",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: "Continue",
        skip_validation: true,
      },
      order: 1,
    },
    {
      id: "divider",
      type: "DIVIDER",
      category: "BLOCK",
      visible: true,
      config: {
        text: "Impersonate another user",
      },
      order: 2,
    },
    {
      id: "user_id",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: "User ID",
      config: {
        placeholder: "Enter user ID to impersonate",
      },
      required: false,
      order: 3,
      messages: errors?.user_id
        ? [{ text: errors.user_id, type: "error" as const }]
        : undefined,
    },
    {
      id: "impersonate",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: "Impersonate",
        variant: "secondary",
      },
      order: 4,
    },
  ];

  const screen: UiScreen = {
    name: "impersonate",
    // Action points to HTML endpoint for no-JS fallback
    action: `${routePrefix}/impersonate?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: "Impersonation",
    description: client.name
      ? `Impersonation for ${escapeHtml(client.name)}`
      : "User impersonation",
    components,
  };

  return {
    screen,
    branding,
  };
}

/**
 * Handle impersonate form submission
 */
async function handleImpersonateSubmit(
  context: ScreenContext,
  data: Record<string, unknown>,
): Promise<
  | { screen: ScreenResult }
  | { redirect: string; cookies?: string[] }
  | { error: string; screen: ScreenResult }
> {
  const { ctx, tenant, client, state } = context;

  // Get login session
  const loginSession = await ctx.env.data.loginSessions.get(tenant.id, state);
  if (!loginSession) {
    throw new HTTPException(400, { message: "Login session not found" });
  }

  if (!loginSession.session_id) {
    throw new HTTPException(400, {
      message: "No session linked to login session",
    });
  }

  // Get the current session
  const currentSession = await ctx.env.data.sessions.get(
    tenant.id,
    loginSession.session_id,
  );

  if (!currentSession) {
    throw new HTTPException(400, { message: "Current session not found" });
  }

  // Get the current user
  const currentUser = await ctx.env.data.users.get(
    tenant.id,
    currentSession.user_id,
  );

  if (!currentUser) {
    throw new HTTPException(400, { message: "Current user not found" });
  }

  // Check if current user has impersonation permission
  const userPermissions = await ctx.env.data.userPermissions.list(
    tenant.id,
    currentUser.user_id,
  );
  const hasImpersonationPermission = userPermissions.some(
    (perm) => perm.permission_name === "users:impersonate",
  );

  if (!hasImpersonationPermission) {
    throw new HTTPException(403, {
      message: "Access denied: insufficient permissions",
    });
  }

  const userIdToImpersonate =
    typeof data.user_id === "string" ? data.user_id.trim() : "";
  // The widget posts the clicked button's id. "Continue" always keeps the
  // current user; otherwise a filled-in user id (Enter in the field, or the
  // no-JS form where only the secondary button carries a name) impersonates.
  const continueClicked = data.continue === "true";
  const impersonateClicked = data.impersonate === "true";

  if (impersonateClicked && !userIdToImpersonate) {
    return {
      error: "User ID is required",
      screen: await impersonateScreen({
        ...context,
        errors: { user_id: "User ID is required" },
      }),
    };
  }

  if (continueClicked || !userIdToImpersonate) {
    await completeLoginSessionHook(ctx, tenant.id, loginSession);

    const response = await createFrontChannelAuthResponse(ctx, {
      client,
      authParams: loginSession.authParams,
      loginSession,
      user: currentUser,
      existingSessionIdToLink: currentSession.id,
      skipHooks: true, // Skip post-login hooks during impersonation
    });

    // Extract redirect URL and cookies from response
    const location = response.headers.get("Location");
    const cookies = response.headers.getSetCookie?.() || [];
    if (location) {
      return { redirect: location, cookies };
    }

    throw new HTTPException(500, { message: "Failed to generate redirect" });
  }

  // Switch to impersonate another user
  const targetUser = await ctx.env.data.users.get(
    tenant.id,
    userIdToImpersonate,
  );

  if (!targetUser) {
    // Log failed impersonation attempt for security auditing
    logMessage(ctx, tenant.id, {
      type: LogTypes.FAILED_IMPERSONATION,
      description: `User ${currentUser.email} failed to impersonate non-existent user: ${userIdToImpersonate}`,
      userId: currentUser.user_id,
    });

    return {
      error: "User not found",
      screen: await impersonateScreen({
        ...context,
        errors: { user_id: "User not found" },
      }),
    };
  }

  await completeLoginSessionHook(ctx, tenant.id, loginSession);

  // Create auth response with impersonated user
  const response = await createFrontChannelAuthResponse(ctx, {
    client,
    authParams: loginSession.authParams,
    loginSession,
    user: targetUser,
    existingSessionIdToLink: currentSession.id,
    impersonatingUser: currentUser,
    skipHooks: true, // Skip post-login hooks during impersonation
  });

  // Extract redirect URL and cookies from response
  const location = response.headers.get("Location");
  const cookies = response.headers.getSetCookie?.() || [];
  if (!location) {
    throw new HTTPException(500, { message: "Failed to generate redirect" });
  }

  // Switch identity only after authorization succeeds, so rejected scopes or
  // failures generating the response leave the original SSO identity intact.
  await ctx.env.data.sessions.update(tenant.id, currentSession.id, {
    user_id: targetUser.user_id,
  });

  // Log successful impersonation after auth response is confirmed
  logMessage(ctx, tenant.id, {
    type: LogTypes.SUCCESS_IMPERSONATION,
    description: `User ${currentUser.email} impersonating ${targetUser.email || targetUser.user_id}`,
    userId: targetUser.user_id,
    actorUserId: currentUser.user_id,
    targetType: "user",
    targetId: targetUser.user_id,
  });

  return { redirect: location, cookies };
}

/**
 * Screen definition for the impersonate screen
 */
export const impersonateScreenDefinition: ScreenDefinition = {
  id: "impersonate",
  name: "Impersonate",
  description: "Allows users with permission to impersonate other users",
  handler: {
    get: impersonateScreen,
    post: handleImpersonateSubmit,
  },
};
