/**
 * Forgot Password screen - initiate password reset
 *
 * Corresponds to: /u/forgot-password
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";

/**
 * Create the forgot-password screen
 */
export async function forgotPasswordScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, baseUrl, prefill, errors, messages } = context;

  const components: FormNodeComponent[] = [
    // Info text
    {
      id: "info",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content:
          "Enter your email address and we'll send you a link to reset your password.",
      },
      order: 0,
    },
    // Email input
    {
      id: "email",
      type: "EMAIL",
      category: "FIELD",
      visible: true,
      label: "Email address",
      config: {
        placeholder: "name@example.com",
      },
      required: true,
      order: 1,
      hint: errors?.email,
    },
    // Submit button
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: "Send reset link",
      },
      order: 2,
    },
  ];

  // Pre-fill email if provided
  if (prefill?.email) {
    const emailComponent = components.find((c) => c.id === "email");
    if (emailComponent && "config" in emailComponent) {
      (emailComponent.config as Record<string, unknown>).value = prefill.email;
    }
  }

  const screen: UiScreen = {
    // Action points to HTML endpoint for no-JS fallback
    action: `${baseUrl}/u2/forgot-password?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: "Reset your password",
    components,
    messages: messages?.map((m) => ({ text: m.text, type: m.type })),
    links: [
      {
        id: "back",
        text: "Remember your password?",
        linkText: "Log in",
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
 * Screen definition for the forgot-password screen
 */
export const forgotPasswordScreenDefinition: ScreenDefinition = {
  id: "forgot-password",
  name: "Forgot Password",
  description: "Password reset request screen",
  handler: {
    get: forgotPasswordScreen,
    // POST handler would:
    // 1. Validate email exists
    // 2. Send password reset email
    // 3. Show confirmation message
  },
};
