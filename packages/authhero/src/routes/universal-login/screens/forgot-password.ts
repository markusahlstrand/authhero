/**
 * Forgot Password screen - initiate password reset
 *
 * Corresponds to: /u2/reset-password/request
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { getLoginPath } from "./types";
import { createTranslation } from "../../../i18n";

/**
 * Create the forgot-password screen
 */
export async function forgotPasswordScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const {
    branding,
    state,
    prefill,
    errors,
    messages,
    customText,
    routePrefix = "/u2",
  } = context;

  // Initialize i18n with locale and custom text overrides
  const locale = context.language || "en";
  const { m } = createTranslation(
    locale,
    customText,
    undefined,
    "forgot-password",
  );

  const components: FormNodeComponent[] = [
    // Info text
    {
      id: "info",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: m.reset_password__description(),
      },
      order: 0,
    },
    // Email input
    {
      id: "email",
      type: "EMAIL",
      category: "FIELD",
      visible: true,
      label: m.reset_password__email_placeholder(),
      config: {
        placeholder: m.reset_password__email_placeholder(),
      },
      required: true,
      order: 1,
      messages: errors?.email
        ? [{ text: errors.email, type: "error" as const }]
        : undefined,
    },
    // Submit button
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.reset_password__button_text(),
      },
      order: 2,
    },
  ];

  // Pre-fill email if provided
  if (prefill?.email) {
    const emailComponent = components.find((c) => c.id === "email");
    if (emailComponent && "config" in emailComponent) {
      (emailComponent.config as Record<string, unknown>).default_value =
        prefill.email;
    }
  }

  const screen: UiScreen = {
    name: "forgot-password",
    // Action points to HTML endpoint for no-JS fallback
    action: `${routePrefix}/reset-password/request?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.reset_password__title(),
    components,
    messages: messages?.map((msg) => ({ text: msg.text, type: msg.type })),
    links: [
      {
        id: "back",
        text: m.reset_password__back_to_login_text(),
        linkText: m.login__button_text(),
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
