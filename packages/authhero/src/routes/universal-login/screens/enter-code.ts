/**
 * Enter Code screen - for email/SMS OTP verification
 *
 * Corresponds to: /u/enter-code
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { escapeHtml } from "../sanitization-utils";
import { passwordlessGrant } from "../../../authentication-flows/passwordless";
import { getPrimaryUserByProvider } from "../../../helpers/users";

/**
 * Create the enter-code screen
 */
export async function enterCodeScreen(context: ScreenContext): Promise<ScreenResult> {
  const { branding, state, baseUrl, errors, messages, data } = context;

  const email = data?.email as string | undefined;
  const maskedEmail = email
    ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
    : "your email";

  const components: FormNodeComponent[] = [
    // Info text
    {
      id: "info",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `We sent a code to ${escapeHtml(maskedEmail)}. Enter it below to continue.`,
      },
      order: 0,
    },
    // Code input
    {
      id: "code",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: "Verification code",
      config: {
        placeholder: "Enter code",
        max_length: 6,
      },
      required: true,
      order: 1,
      hint: errors?.code,
    },
    // Submit button
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: "Continue",
      },
      order: 2,
    },
    // Resend button
    {
      id: "resend",
      type: "RESEND_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: "Resend code",
      },
      order: 3,
    },
  ];

  const screen: UiScreen = {
    // Action points to HTML endpoint for no-JS fallback
    action: `${baseUrl}/u2/enter-code?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: "Check your email",
    description: "Enter the verification code",
    components,
    messages: messages?.map((m) => ({ text: m.text, type: m.type })),
    links: [
      {
        id: "back",
        text: "Back to",
        linkText: "login",
        href: `${baseUrl}/u2/login/identifier?state=${encodeURIComponent(state)}`,
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

      // Validate code is provided
      if (!code) {
        return {
          error: "Verification code is required",
          screen: await enterCodeScreen({
            ...context,
            errors: { code: "Verification code is required" },
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
          screen: await enterCodeScreen({
            ...context,
            errors: { code: "Session expired. Please start over." },
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
          if (location) {
            return { redirect: location };
          }
        }

        // If we got here, something went wrong
        return {
          error: "Unexpected error",
          screen: await enterCodeScreen({
            ...context,
            errors: { code: "An unexpected error occurred. Please try again." },
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
            provider: "auth2",
          });
          hasPasswordLogin = !!passwordUser;
        } catch {
          // Ignore errors
        }

        const errorMessage = (e as Error).message || "Invalid or expired code";

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
