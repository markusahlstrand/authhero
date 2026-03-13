/**
 * Enter Code screen - for email/SMS OTP verification
 *
 * Corresponds to: /u/enter-code
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { escapeHtml } from "../sanitization-utils";
import { createTranslation } from "../../../i18n";
import { passwordlessGrant } from "../../../authentication-flows/passwordless";
import { getPrimaryUserByProvider } from "../../../helpers/users";
import { USERNAME_PASSWORD_PROVIDER } from "../../../constants";

/**
 * Create the enter-code screen
 */
export async function enterCodeScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, messages, data, customText, routePrefix } =
    context;

  // Initialize i18n with locale and custom text overrides
  const locale = context.language || "en";
  const { m } = createTranslation(locale, customText);

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
      hint: errors?.code,
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
    name: "enter-code",
    // Action points to HTML endpoint for no-JS fallback
    action: `${routePrefix}/enter-code?state=${encodeURIComponent(state)}`,
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
 * Screen definition for the enter-code screen
 */
export const enterCodeScreenDefinition: ScreenDefinition = {
  id: "enter-code",
  name: "Enter Code",
  description: "OTP code verification screen",
  handler: {
    get: enterCodeScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const code = (data.code as string)?.trim();

      // Initialize i18n for validation/error messages
      const locale = context.language || "en";
      const { m } = createTranslation(locale, context.customText);

      // Validate code is provided
      if (!code) {
        const errorMessage = m.no_code();
        return {
          error: errorMessage,
          screen: await enterCodeScreen({
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
          screen: await enterCodeScreen({
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
          screen: await enterCodeScreen({
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

        const errorMessage =
          (e as Error).message || m.unexpected_error_try_again();

        return {
          error: errorMessage,
          screen: await enterCodeScreen({
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
