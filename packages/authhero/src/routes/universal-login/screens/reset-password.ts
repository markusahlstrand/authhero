/**
 * Reset Password screen - set new password after reset
 *
 * Corresponds to: /u/reset-password
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";

/**
 * Create the reset-password screen
 */
export async function resetPasswordScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, baseUrl, errors, messages } = context;

  const components: FormNodeComponent[] = [
    // New password input
    {
      id: "password",
      type: "PASSWORD",
      category: "FIELD",
      visible: true,
      label: "New password",
      config: {
        placeholder: "Enter new password",
        show_toggle: true,
      },
      required: true,
      sensitive: true,
      order: 0,
      hint: errors?.password,
    },
    // Confirm password input
    {
      id: "confirm_password",
      type: "PASSWORD",
      category: "FIELD",
      visible: true,
      label: "Confirm new password",
      config: {
        placeholder: "Confirm new password",
      },
      required: true,
      sensitive: true,
      order: 1,
      hint: errors?.confirm_password,
    },
    // Submit button
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: "Reset password",
      },
      order: 2,
    },
  ];

  const screen: UiScreen = {
    // Action points to HTML endpoint for no-JS fallback
    action: `${baseUrl}/u2/reset-password?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: "Set your new password",
    description: "Choose a strong password for your account",
    components,
    messages: messages?.map((m) => ({ text: m.text, type: m.type })),
  };

  return {
    screen,
    branding,
  };
}

/**
 * Screen definition for the reset-password screen
 */
export const resetPasswordScreenDefinition: ScreenDefinition = {
  id: "reset-password",
  name: "Reset Password",
  description: "Set new password screen",
  handler: {
    get: resetPasswordScreen,
    // POST handler would:
    // 1. Validate passwords match
    // 2. Validate password meets requirements
    // 3. Update user password
    // 4. Redirect to login or auto-login
  },
};
