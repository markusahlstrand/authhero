/**
 * Reset Password Code screen - enter code + new password
 *
 * Used when the connection's verification_method is "code".
 * The user receives a 6-digit code via email and enters it
 * along with their new password on the same page.
 *
 * Corresponds to: /u2/reset-password/code
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { getLoginPath } from "./types";
import { escapeHtml } from "../sanitization-utils";
import { createTranslation } from "../../../i18n";
import { requestPasswordReset } from "../../../authentication-flows/password";
import { executePasswordReset } from "./reset-password";

/**
 * Create the reset-password-code screen
 */
export async function resetPasswordCodeScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const {
    branding,
    state,
    errors,
    messages,
    data,
    customText,
    routePrefix = "/u2",
  } = context;

  const locale = context.language || "en";
  const { m } = createTranslation(
    "reset-password",
    "reset-password-code",
    locale,
    customText,
  );
  const { m: loginM } = createTranslation("login", "login", locale, customText);

  const email = data?.email as string | undefined;
  const maskedEmail = email ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3") : "";

  const description = maskedEmail
    ? m.description({
        email: `<strong>${escapeHtml(maskedEmail)}</strong>`,
      })
    : m.defaultDescription();

  const components: FormNodeComponent[] = [
    // Info text
    {
      id: "info",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: description,
      },
      order: 0,
    },
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
      order: 1,
      messages: errors?.code
        ? [{ text: errors.code, type: "error" as const }]
        : undefined,
    },
    // New password input
    {
      id: "password",
      type: "PASSWORD",
      category: "FIELD",
      visible: true,
      label: m.passwordLabel(),
      config: {
        placeholder: m.passwordPlaceholder(),
        show_toggle: true,
      },
      required: true,
      sensitive: true,
      order: 2,
      messages: errors?.password
        ? [{ text: errors.password, type: "error" as const }]
        : undefined,
    },
    // Confirm password input
    {
      id: "confirm_password",
      type: "PASSWORD",
      category: "FIELD",
      visible: true,
      label: m.confirmPasswordLabel(),
      config: {
        placeholder: m.confirmPasswordPlaceholder(),
      },
      required: true,
      sensitive: true,
      order: 3,
      messages: errors?.confirm_password
        ? [{ text: errors.confirm_password, type: "error" as const }]
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
      order: 4,
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
      order: 5,
    },
  ];

  const screen: UiScreen = {
    name: "reset-password-code",
    action: `${routePrefix}/reset-password/code?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    components,
    messages: messages?.map((msg) => ({ text: msg.text, type: msg.type })),
    links: [
      {
        id: "back",
        text: m.backToLoginText(),
        linkText: loginM.buttonText(),
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
 * Screen definition for the reset-password-code screen
 */
export const resetPasswordCodeScreenDefinition: ScreenDefinition = {
  id: "reset-password-code",
  name: "Reset Password Code",
  description: "Enter reset code and new password screen",
  handler: {
    get: resetPasswordCodeScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;

      const locale = context.language || "en";
      const { m } = createTranslation(
        "reset-password",
        "reset-password-code",
        locale,
        context.customText,
      );

      // Handle resend action
      if (data.action === "resend") {
        const loginSession = await ctx.env.data.loginSessions.get(
          client.tenant.id,
          state,
        );

        if (!loginSession?.authParams?.username) {
          const errorMessage = m.sessionExpired();
          return {
            error: errorMessage,
            screen: await resetPasswordCodeScreen({
              ...context,
              errors: { code: errorMessage },
            }),
          };
        }

        await requestPasswordReset(
          ctx,
          client,
          loginSession.authParams.username,
          state,
          "code",
        );

        return {
          screen: await resetPasswordCodeScreen({
            ...context,
            messages: [{ text: m.resendSuccess(), type: "success" as const }],
          }),
        };
      }

      // Handle code + password submission
      const code = (data.code as string)?.trim();
      const password = (data.password as string)?.trim();
      const confirmPassword = (data.confirm_password as string)?.trim();

      // Validate code is provided
      if (!code) {
        const errorMessage = m.noCode();
        return {
          error: errorMessage,
          screen: await resetPasswordCodeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      // Validate password is provided
      if (!password) {
        return {
          error: "Password is required",
          screen: await resetPasswordCodeScreen({
            ...context,
            errors: { password: "Password is required" },
          }),
        };
      }

      // Validate passwords match
      if (password !== confirmPassword) {
        const errorMessage = m.passwordsDidntMatch();
        return {
          error: errorMessage,
          screen: await resetPasswordCodeScreen({
            ...context,
            errors: { confirm_password: errorMessage },
          }),
        };
      }

      // Get the login session to find the username
      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession?.authParams?.username) {
        const errorMessage = m.sessionExpired();
        return {
          error: errorMessage,
          screen: await resetPasswordCodeScreen({
            ...context,
            errors: { code: errorMessage },
          }),
        };
      }

      const result = await executePasswordReset({
        ctx,
        client,
        code,
        password,
        username: loginSession.authParams.username,
      });

      if ("success" in result) {
        const redirectUrl = `/u2/identifier?state=${encodeURIComponent(state)}&message=password_reset_success`;
        return { redirect: redirectUrl };
      }

      const errorMessage =
        result.error === "code_expired" ? m.invalidCode() : result.error;

      return {
        error: errorMessage,
        screen: await resetPasswordCodeScreen({
          ...context,
          errors: { [result.field]: errorMessage },
        }),
      };
    },
  },
};
