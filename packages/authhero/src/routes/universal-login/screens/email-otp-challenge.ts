/**
 * Email OTP Challenge screen - for email OTP verification
 *
 * Corresponds to: /u/login/email-otp-challenge
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { getLoginPath } from "./types";
import { escapeHtml } from "../sanitization-utils";
import { createTranslation } from "../../../i18n";
import { passwordlessGrant } from "../../../authentication-flows/passwordless";
import { JSONHTTPException } from "../../../errors/json-http-exception";
import { getPrimaryUserByProvider } from "../../../helpers/users";
import { USERNAME_PASSWORD_PROVIDER } from "../../../constants";

/**
 * Create the email-otp-challenge screen
 */
export async function emailOtpChallengeScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, messages, data, customText, routePrefix } =
    context;

  // Initialize i18n with locale and custom text overrides
  const locale = context.language || "en";
  const { m } = createTranslation(locale, customText, undefined, "email-otp-challenge");

  const email = data?.email as string | undefined;
  const maskedEmail = email ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3") : "";

  const description = maskedEmail
    ? m.code_sent_template({
        username: `<strong>${escapeHtml(maskedEmail)}</strong>`,
      })
    : m.enter_code_description();

  const components: FormNodeComponent[] = [
    // Code input
    {
      id: "code",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: m.enter_code_label(),
      config: {
        placeholder: m.enter_code_placeholder(),
        max_length: 6,
      },
      required: true,
      order: 0,
      messages: errors?.code
        ? [{ text: errors.code, type: "error" as const }]
        : undefined,
    },
    // Submit button
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.log_in(),
      },
      order: 1,
    },
    // Resend button
    {
      id: "resend",
      type: "RESEND_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.resend_code(),
      },
      order: 2,
    },
  ];

  const screen: UiScreen = {
    name: "email-otp-challenge",
    // Action points to HTML endpoint for no-JS fallback
    action: `${routePrefix}/login/email-otp-challenge?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.enter_code_title(),
    description,
    components,
    messages: messages?.map((msg) => ({ text: msg.text, type: msg.type })),
    links: [
      {
        id: "back",
        text: "",
        linkText: m.go_back(),
        href: `${await getLoginPath(context)}?state=${encodeURIComponent(state)}`,
      },
    ],
  };

  return {
    screen,
    branding,
  };
}

/**
 * Screen definition for the email-otp-challenge screen
 */
export const emailOtpChallengeScreenDefinition: ScreenDefinition = {
  id: "email-otp-challenge",
  name: "Email OTP Challenge",
  description: "Email OTP code verification screen",
  handler: {
    get: emailOtpChallengeScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const code = (data.code as string)?.trim();

      // Initialize i18n for validation/error messages
      const locale = context.language || "en";
      const { m } = createTranslation(locale, context.customText, undefined, "email-otp-challenge");

      // Validate code is provided
      if (!code) {
        const errorMessage = m.no_code();
        return {
          error: errorMessage,
          screen: await emailOtpChallengeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      // Get the login session to find the username
      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession || !loginSession.authParams?.username) {
        const errorMessage = m.session_expired();
        return {
          error: errorMessage,
          screen: await emailOtpChallengeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      try {
        const result = await passwordlessGrant(ctx, {
          client_id: client.client_id,
          authParams: loginSession.authParams,
          username: loginSession.authParams.username,
          otp: code,
        });

        if (result instanceof Response) {
          // Get the redirect URL from the response
          const location = result.headers.get("location");
          // Extract Set-Cookie headers to pass to the caller
          const cookies = result.headers.getSetCookie?.() || [];
          if (location) {
            return { redirect: location, cookies };
          }
          // For non-redirect responses (e.g., web_message mode), pass through directly
          return { response: result };
        }

        // If we got here (result is not a Response), something went wrong
        const errorMessage = m.unexpected_error_try_again();
        return {
          error: errorMessage,
          screen: await emailOtpChallengeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      } catch (e: unknown) {
        // Check if user has password login available
        let hasPasswordLogin = false;
        try {
          const passwordUser = await getPrimaryUserByProvider({
            userAdapter: ctx.env.data.users,
            tenant_id: client.tenant.id,
            username: loginSession.authParams.username,
            provider: USERNAME_PASSWORD_PROVIDER,
          });
          hasPasswordLogin = !!passwordUser;
        } catch {
          // Ignore errors
        }

        let errorMessage: string = m.unexpected_error_try_again() as string;
        if (e instanceof JSONHTTPException) {
          try {
            const parsed = JSON.parse((e as Error).message);
            if (parsed.message) {
              errorMessage = parsed.message;
            }
          } catch {
            // Keep the generic error message for non-JSON errors
          }
        }

        return {
          error: errorMessage,
          screen: await emailOtpChallengeScreen({
            ...context,
            errors: { code: errorMessage },
            data: {
              ...context.data,
              hasPasswordLogin,
            },
          }),
        };
      }
    },
  },
};
