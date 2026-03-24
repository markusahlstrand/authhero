/**
 * Check Account screen - allows users to continue with an existing session
 * or switch to a different account
 *
 * Corresponds to: /u2/check-account
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { getLoginPath } from "./types";
import { createTranslation } from "../../../i18n";
import { HTTPException } from "hono/http-exception";
import { RedirectException } from "../../../errors/redirect-exception";
import { escapeHtml } from "../sanitization-utils";
import { createFrontChannelAuthResponse } from "../../../authentication-flows/common";
import { getAuthCookie } from "../../../utils/cookies";

/**
 * Create the check-account screen
 */
export async function checkAccountScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const {
    ctx,
    tenant,
    branding,
    state,
    routePrefix = "/u2",
    customText,
  } = context;

  // Initialize i18n with locale and custom text overrides
  const locale = context.language || "en";
  const { m } = createTranslation(
    "check-account",
    "check-account",
    locale,
    customText,
  );

  const loginPath = await getLoginPath(context);

  // Get login session
  const loginSession = await ctx.env.data.loginSessions.get(tenant.id, state);
  if (!loginSession) {
    throw new HTTPException(400, { message: "Login session not found" });
  }

  // Get session from cookie
  const authCookie = getAuthCookie(tenant.id, ctx.req.header("cookie"));
  const session = authCookie
    ? await ctx.env.data.sessions.get(tenant.id, authCookie)
    : null;

  // If no valid session, redirect to login
  if (!session || session.revoked_at) {
    throw new RedirectException(
      `${loginPath}?state=${encodeURIComponent(state)}`,
    );
  }

  // Get the current user
  const user = await ctx.env.data.users.get(tenant.id, session.user_id);

  if (!user) {
    throw new RedirectException(
      `${loginPath}?state=${encodeURIComponent(state)}`,
    );
  }

  const components: FormNodeComponent[] = [
    // Info text showing current user
    {
      id: "info",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<p>${m.loggedInAs({ email: escapeHtml(user.email || user.user_id) })}</p>`,
      },
      order: 0,
    },
    // Continue button
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.yesContinue(),
      },
      order: 1,
    },
  ];

  const screen: UiScreen = {
    name: "check-account",
    action: `${routePrefix}/check-account?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    description: m.description(),
    components,
    links: [
      {
        id: "use-another-account",
        text: m.noUseAnother(),
        href: `${loginPath}?state=${encodeURIComponent(state)}`,
      },
    ],
  };

  return {
    screen,
    branding,
  };
}

/**
 * Handle check-account form submission
 */
async function handleCheckAccountSubmit(
  context: ScreenContext,
  _data: Record<string, unknown>,
): Promise<
  | { screen: ScreenResult }
  | { redirect: string; cookies?: string[] }
  | { error: string; screen: ScreenResult }
  | { response: Response }
> {
  const { ctx, tenant, client, state } = context;

  // Get login session
  const loginSession = await ctx.env.data.loginSessions.get(tenant.id, state);
  if (!loginSession) {
    throw new HTTPException(400, { message: "Login session not found" });
  }

  // Get session from cookie
  const authCookie = getAuthCookie(tenant.id, ctx.req.header("cookie"));
  const session = authCookie
    ? await ctx.env.data.sessions.get(tenant.id, authCookie)
    : null;

  const loginPath = await getLoginPath(context);

  // If no valid session, redirect to login
  if (!session || session.revoked_at) {
    return {
      redirect: `${loginPath}?state=${encodeURIComponent(state)}`,
    };
  }

  // Get the current user
  const user = await ctx.env.data.users.get(tenant.id, session.user_id);

  if (!user) {
    return {
      redirect: `${loginPath}?state=${encodeURIComponent(state)}`,
    };
  }

  try {
    // Continue with the authentication flow using existing session
    const response = await createFrontChannelAuthResponse(ctx, {
      client,
      authParams: loginSession.authParams,
      loginSession,
      user,
      existingSessionIdToLink: session.id,
    });

    // Extract redirect URL and cookies from response
    const location = response.headers.get("Location");
    const cookies = response.headers.getSetCookie?.() || [];
    if (location) {
      return { redirect: location, cookies };
    }

    // For non-redirect responses (e.g., web_message mode), pass through directly
    return { response };
  } catch (error: unknown) {
    // Handle known error cases with user-friendly messages
    const errorMessage =
      error instanceof Error ? error.message : "An unexpected error occurred";

    // For session state errors, redirect to login to start fresh
    if (
      errorMessage.includes("session") ||
      errorMessage.includes("expired") ||
      errorMessage.includes("completed") ||
      errorMessage.includes("failed")
    ) {
      return {
        redirect: `${loginPath}?state=${encodeURIComponent(state)}`,
      };
    }

    // For other errors, show a user-friendly error on the check-account screen
    // Note: We create a fresh translation context here since we're in the error handler
    const locale = context.language || "en";
    const { m } = createTranslation(
      "check-account",
      "check-account",
      locale,
      context.customText,
    );
    return {
      error: m.error(),
      screen: await checkAccountScreen(context),
    };
  }
}

/**
 * Screen definition for the check-account screen
 */
export const checkAccountScreenDefinition: ScreenDefinition = {
  id: "check-account",
  name: "Check Account",
  description: "Allows users to continue with an existing session",
  handler: {
    get: checkAccountScreen,
    post: handleCheckAccountSubmit,
  },
};
