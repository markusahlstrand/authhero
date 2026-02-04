/**
 * Enter Password screen - for password authentication
 *
 * Corresponds to: /u/enter-password
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { escapeHtml } from "../sanitization-utils";
import { getCustomText, getErrorText } from "./custom-text-utils";

/**
 * Create the enter-password screen
 */
export async function enterPasswordScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, baseUrl, errors, data, customText, client } =
    context;

  const email = data?.email as string | undefined;

  // Variables for text substitution
  const textVariables = {
    clientName: client?.name || "the application",
    email: email,
  };

  // Get error hint with custom text support
  // Only map known error patterns to custom text keys, otherwise use the raw error
  let passwordError: string | undefined;
  if (errors?.password) {
    if (errors.password.includes("wrong")) {
      passwordError = getErrorText(
        customText,
        "wrong-credentials",
        errors.password,
        textVariables,
      );
    } else if (
      errors.password.includes("no-password") ||
      errors.password.includes("required")
    ) {
      passwordError = getErrorText(
        customText,
        "no-password",
        errors.password,
        textVariables,
      );
    } else {
      // Unknown error - return as-is without custom text mapping
      passwordError = errors.password;
    }
  }

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
      label: getCustomText(
        customText,
        "passwordPlaceholder",
        "Password",
        textVariables,
      ),
      config: {
        placeholder: getCustomText(
          customText,
          "passwordPlaceholder",
          "Enter your password",
          textVariables,
        ),
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
        text: getCustomText(customText, "buttonText", "Continue", textVariables),
      },
      order: 2,
    },
  ];

  const screen: UiScreen = {
    // Action points to HTML endpoint for no-JS fallback
    action: `${baseUrl}/u2/enter-password?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: getCustomText(
      customText,
      "title",
      "Enter your password",
      textVariables,
    ),
    components,
    links: [
      {
        id: "forgot-password",
        text: getCustomText(
          customText,
          "forgotPasswordText",
          "Forgot your password?",
          textVariables,
        ),
        linkText: "Reset it",
        href: `${baseUrl}/u/widget/forgot-password?state=${encodeURIComponent(state)}`,
      },
      {
        id: "back",
        text: "Not your account?",
        linkText: getCustomText(
          customText,
          "editEmailText",
          "Go back",
          textVariables,
        ),
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
 * Screen definition for the enter-password screen
 */
export const enterPasswordScreenDefinition: ScreenDefinition = {
  id: "enter-password",
  name: "Enter Password",
  description: "Password authentication screen",
  handler: {
    get: enterPasswordScreen,
    // POST handler would:
    // 1. Validate password against user
    // 2. Complete login if valid
    // 3. Return error if invalid
    // 4. Handle account lockout
  },
};
