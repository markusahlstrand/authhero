/**
 * Enter Password screen - for password authentication
 *
 * Corresponds to: /u/enter-password
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { escapeHtml } from "../sanitization-utils";
import { createTranslation } from "../../../i18n";
import { loginWithPassword } from "../../../authentication-flows/password";
import { AuthError } from "../../../types/AuthError";

/**
 * Create the enter-password screen
 */
export async function enterPasswordScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, data, customText, routePrefix } = context;

  // Initialize i18n with locale and custom text overrides
  const locale = context.language || "en";
  const { m } = createTranslation(locale, customText);

  const email = data?.email as string | undefined;

  // Get error hint - use raw error message
  const passwordError = errors?.password;

  const components: FormNodeComponent[] = [
    // Show email being logged in
    ...(email
      ? [
          {
            id: "email-display",
            type: "RICH_TEXT",
            category: "BLOCK",
            visible: true,
            config: {
              content: `Signing in as <strong>${escapeHtml(email)}</strong>`,
            },
            order: 0,
          } as FormNodeComponent,
        ]
      : []),
    // Password input
    {
      id: "password",
      type: "PASSWORD",
      category: "FIELD",
      visible: true,
      label: m.password(),
      config: {
        placeholder: m.enter_password(),
      },
      required: true,
      sensitive: true,
      order: 1,
      hint: passwordError,
    },
    // Submit button
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.continue(),
      },
      order: 2,
    },
  ];

  const screen: UiScreen = {
    name: "enter-password",
    // Action points to HTML endpoint for no-JS fallback
    action: `${routePrefix}/enter-password?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.enter_password(),
    components,
    links: [
      {
        id: "forgot-password",
        text: m.forgot_password_link(),
        linkText: m.reset_password_cta(),
        href: `${routePrefix}/forgot-password?state=${encodeURIComponent(state)}`,
      },
      {
        id: "back",
        text: "",
        linkText: m.go_back(),
        href: `${routePrefix}/login/identifier?state=${encodeURIComponent(state)}`,
      },
    ],
  };

  return {
    screen,
    branding,
  };
}

/**
 * Screen definition for the enter-password screen
 */
export const enterPasswordScreenDefinition: ScreenDefinition = {
  id: "enter-password",
  name: "Enter Password",
  description: "Password authentication screen",
  handler: {
    get: enterPasswordScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const password = (data.password as string)?.trim();

      // Validate password is provided
      if (!password) {
        return {
          error: "Password is required",
          screen: await enterPasswordScreen({
            ...context,
            errors: { password: "Password is required" },
          }),
        };
      }

      // Get the login session to find the username
      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession || !loginSession.authParams?.username) {
        return {
          error: "Session expired",
          screen: await enterPasswordScreen({
            ...context,
            errors: { password: "Session expired. Please start over." },
          }),
        };
      }

      try {
        const result = await loginWithPassword(
          ctx,
          client,
          {
            ...loginSession.authParams,
            password,
          },
          loginSession,
        );

        // Get the redirect URL from the response
        const location = result.headers.get("location");
        // Extract Set-Cookie headers to pass to the caller
        const cookies = result.headers.getSetCookie?.() || [];
        if (location) {
          return { redirect: location, cookies };
        }
        // For non-redirect responses (e.g., web_message mode), pass through directly
        return { response: result };
      } catch (e: unknown) {
        const authError = e as AuthError;
        // Initialize i18n for error messages
        const locale = context.language || "en";
        const { m } = createTranslation(locale, context.customText);

        let errorMessage = authError.message || m.invalid_password();

        if (
          authError.code === "INVALID_PASSWORD" ||
          authError.code === "USER_NOT_FOUND"
        ) {
          errorMessage = m.invalid_password();
        } else if (authError.code === "EMAIL_NOT_VERIFIED") {
          errorMessage = m.unverified_email();
        } else if (authError.code === "TOO_MANY_FAILED_LOGINS") {
          errorMessage = m.too_many_failed_logins();
        }

        return {
          error: errorMessage,
          screen: await enterPasswordScreen({
            ...context,
            errors: { password: errorMessage },
          }),
        };
      }
    },
  },
};
