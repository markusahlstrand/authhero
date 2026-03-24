/**
 * Email OTP Challenge screen - for email OTP verification
 *
 * Corresponds to: /u/login/email-otp-challenge
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { LoginSessionState, Strategy } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { getLoginPath } from "./types";
import { escapeHtml } from "../sanitization-utils";
import { createTranslation } from "../../../i18n";
import { passwordlessGrant } from "../../../authentication-flows/passwordless";
import { createFrontChannelAuthResponse } from "../../../authentication-flows/common";
import { HTTPException } from "hono/http-exception";
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
  const { m } = createTranslation(
    "email-otp-challenge",
    "email-otp-challenge",
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
  const maskedEmail = email ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3") : "";

  const description = maskedEmail
    ? m.description({
        email: `<strong>${escapeHtml(maskedEmail)}</strong>`,
      })
    : m.defaultDescription();

  const components: FormNodeComponent[] = [
    // Code input
    {
      id: "code",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: m.codeLabel(),
      config: {
        placeholder: m.codePlaceholder(),
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
        text: m.buttonText(),
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
        text: m.resendText(),
      },
      order: 2,
    },
  ];

  // Determine the back link: if there's no password connection, the user
  // is in a passwordless flow and should go back to the passwordless identifier
  const hasPasswordConnection = context.connections.some(
    (c) => c.strategy === Strategy.USERNAME_PASSWORD,
  );
  const backPath = hasPasswordConnection
    ? await getLoginPath(context)
    : `${routePrefix}/login/login-passwordless-identifier`;

  const screen: UiScreen = {
    name: "email-otp-challenge",
    // Action points to HTML endpoint for no-JS fallback
    action: `${routePrefix}/login/email-otp-challenge?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    description,
    components,
    messages: messages?.map((msg) => ({ text: msg.text, type: msg.type })),
    links: [
      {
        id: "back",
        text: "",
        linkText: common.backText(),
        href: `${backPath}?state=${encodeURIComponent(state)}`,
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
      const { m } = createTranslation(
        "email-otp-challenge",
        "email-otp-challenge",
        locale,
        context.customText,
      );

      // Validate code is provided
      if (!code) {
        const errorMessage = m.noCode();
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
        const errorMessage = m.sessionExpired();
        return {
          error: errorMessage,
          screen: await emailOtpChallengeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      // If the session is already past OTP verification (e.g. awaiting MFA from
      // a previous successful OTP submission), skip OTP validation and resume
      // the auth flow. This handles the case where the user navigates back to
      // this screen after being redirected to MFA.
      const sessionState = loginSession.state || LoginSessionState.PENDING;
      if (
        sessionState === LoginSessionState.AWAITING_MFA ||
        sessionState === LoginSessionState.AUTHENTICATED
      ) {
        try {
          // Look up the user from the session
          const session = loginSession.session_id
            ? await ctx.env.data.sessions.get(
                client.tenant.id,
                loginSession.session_id,
              )
            : null;

          if (session?.user_id) {
            const user = await ctx.env.data.users.get(
              client.tenant.id,
              session.user_id,
            );

            if (user) {
              const result = await createFrontChannelAuthResponse(ctx, {
                authParams: loginSession.authParams,
                client,
                user,
                loginSession,
              });

              if (result instanceof Response) {
                const location = result.headers.get("location");
                const cookies = result.headers.getSetCookie?.() || [];
                if (location) {
                  return { redirect: location, cookies };
                }
                return { response: result };
              }
            }
          }
        } catch {
          // If resuming fails, fall through to normal OTP validation
        }
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
        const errorMessage = m.unexpectedError();
        return {
          error: errorMessage,
          screen: await emailOtpChallengeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      } catch (e: unknown) {
        console.error(
          "[email-otp-challenge] Error:",
          e instanceof Error ? e.stack || e.message : e,
        );

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

        let errorMessage: string = m.unexpectedError() as string;
        if (e instanceof JSONHTTPException) {
          try {
            const parsed = JSON.parse((e as Error).message);
            if (parsed.message) {
              errorMessage = parsed.message;
            }
          } catch {
            // Keep the generic error message for non-JSON errors
          }
        } else if (e instanceof HTTPException) {
          errorMessage = e.message;
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
