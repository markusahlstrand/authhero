/**
 * Enter Password screen - for password authentication
 *
 * Corresponds to: /u/enter-password
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { Strategy } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { getLoginPath, isIdentifierFirstLogin } from "./types";
import { escapeHtml } from "../sanitization-utils";
import { createTranslation } from "../../../i18n";
import { loginWithPassword } from "../../../authentication-flows/password";
import { AuthError } from "../../../types/AuthError";
import { userExistsByEmail } from "../../../helpers/users";
import { validateSignupEmail } from "../../../hooks";
import { sendLoginOtp } from "./login-otp";
import { emailOtpChallengeScreen } from "./email-otp-challenge";

/**
 * Whether the user can switch from the password challenge to an emailed code.
 * Only offered in the identifier-first flow — the combined login page already
 * lets the user pick — and only for email identifiers on a client with a
 * code-based email connection.
 */
async function canSwitchToEmailCode(
  context: ScreenContext,
  email: string | undefined,
): Promise<boolean> {
  if (!email?.includes("@")) return false;
  const emailConnection = context.connections.find(
    (c) => c.strategy === Strategy.EMAIL,
  );
  if (
    !emailConnection ||
    emailConnection.options?.authentication_method === "magic_link"
  ) {
    return false;
  }
  return isIdentifierFirstLogin(context);
}

/**
 * Create the enter-password screen
 */
export async function enterPasswordScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, data, customText, routePrefix } = context;

  // Initialize i18n with locale and custom text overrides
  const locale = context.language || "en";
  const { m } = createTranslation(
    "login-password",
    "login-password",
    locale,
    customText,
  );
  const { m: common } = createTranslation(
    "common",
    "common",
    locale,
    customText,
  );

  const email = data?.email as string | undefined;

  const passwordMessages = errors?.password
    ? [{ text: errors.password, type: "error" as const }]
    : undefined;

  // Build description with email display (like email-otp-challenge screen)
  const description = email
    ? m.signingInAs({
        email: `<strong>${escapeHtml(email)}</strong>`,
      })
    : undefined;

  const components: FormNodeComponent[] = [
    // Password input
    {
      id: "password",
      type: "PASSWORD",
      category: "FIELD",
      visible: true,
      label: m.passwordPlaceholder(),
      config: {
        placeholder: m.passwordPlaceholder(),
      },
      required: true,
      sensitive: true,
      order: 0,
      messages: passwordMessages,
    },
    // Forgot password link (between password and submit)
    {
      id: "forgot-password-link",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<div class="forgot-password-link"><a href="${routePrefix}/reset-password/request?state=${encodeURIComponent(state)}">${m.forgotPasswordText()}</a></div>`,
      },
      order: 1,
    } as FormNodeComponent,
    // Submit button
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.buttonText(),
      },
      order: 2,
    },
  ];

  if (await canSwitchToEmailCode(context, email)) {
    components.push(
      {
        id: "divider",
        type: "DIVIDER",
        category: "BLOCK",
        visible: true,
        order: 3,
        config: {
          text: common.orText(),
        },
      },
      {
        id: "send-code",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: m.sendCodeText(),
          variant: "secondary",
          skip_validation: true,
        },
        order: 4,
      },
    );
  }

  const loginPath = await getLoginPath(context);

  const screen: UiScreen = {
    name: "enter-password",
    // Action points to HTML endpoint for no-JS fallback
    action: `${routePrefix}/enter-password?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    description,
    components,
    links: [
      {
        id: "back",
        text: "",
        linkText: common.backText(),
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

      // "Log in with a code" switch: email a code and show the OTP challenge
      if (data["send-code"] === "true") {
        return switchToEmailCode(context);
      }

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
        const { m } = createTranslation(
          "login-password",
          "login-password",
          locale,
          context.customText,
        );

        let errorMessage = authError.message || m["wrong-credentials"]();

        if (
          authError.code === "INVALID_PASSWORD" ||
          authError.code === "USER_NOT_FOUND"
        ) {
          errorMessage = m["wrong-credentials"]();
        } else if (authError.code === "EMAIL_NOT_VERIFIED") {
          errorMessage = m.unverifiedEmail();
        } else if (authError.code === "TOO_MANY_FAILED_LOGINS") {
          errorMessage = m["user-blocked"]();
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

/**
 * Handle the switch from the password screen to an emailed one-time code.
 */
async function switchToEmailCode(context: ScreenContext) {
  const { ctx, client, state } = context;
  const loginSession = await ctx.env.data.loginSessions.get(
    client.tenant.id,
    state,
  );
  const email = loginSession?.authParams?.username;

  if (!loginSession || !email) {
    return {
      error: "Session expired",
      screen: await enterPasswordScreen({
        ...context,
        errors: { password: "Session expired. Please start over." },
      }),
    };
  }

  if (!(await canSwitchToEmailCode(context, email))) {
    return { screen: await enterPasswordScreen(context) };
  }

  // Mirror the identifier screen: an unknown email only gets a code if it
  // could sign up. Otherwise show the challenge without sending anything so
  // the switch doesn't reveal whether the account exists.
  let mayReceiveCode = await userExistsByEmail({
    userAdapter: ctx.env.data.users,
    tenant_id: client.tenant.id,
    email,
  });
  if (!mayReceiveCode) {
    const validation = await validateSignupEmail(
      ctx,
      client,
      ctx.env.data,
      email,
      Strategy.EMAIL,
      { identifierPreflight: true },
    );
    mayReceiveCode = validation.allowed;
  }

  if (mayReceiveCode) {
    await sendLoginOtp(ctx, {
      client,
      loginSession,
      to: email,
      magicLink: false,
    });
  }

  return {
    screen: await emailOtpChallengeScreen({
      ...context,
      errors: undefined,
      data: { email },
    }),
  };
}
