/**
 * Enter Password screen - for password authentication
 *
 * Corresponds to: /u/enter-password
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { escapeHtml } from "../sanitization-utils";

/**
 * Create the enter-password screen
 */
export async function enterPasswordScreen(context: ScreenContext): Promise<ScreenResult> {
  const { branding, state, baseUrl, errors, data } = context;

  const email = data?.email as string | undefined;

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
      label: "Password",
      config: {
        placeholder: "Enter your password",
      },
      required: true,
      sensitive: true,
      order: 1,
      hint: errors?.password,
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
  ];

  const screen: UiScreen = {
    // Action points to HTML endpoint for no-JS fallback
    action: `${baseUrl}/u2/enter-password?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: "Enter your password",
    components,
    links: [
      {
        id: "forgot-password",
        text: "Forgot your password?",
        linkText: "Reset it",
        href: `${baseUrl}/u/widget/forgot-password?state=${encodeURIComponent(state)}`,
      },
      {
        id: "back",
        text: "Not your account?",
        linkText: "Go back",
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
