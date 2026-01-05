/**
 * Enter Code screen - for email/SMS OTP verification
 *
 * Corresponds to: /u/enter-code
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";

/**
 * Create the enter-code screen
 */
export function enterCodeScreen(context: ScreenContext): ScreenResult {
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
        content: `We sent a code to ${maskedEmail}. Enter it below to continue.`,
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
    action: `${baseUrl}/u/widget/enter-code?state=${encodeURIComponent(state)}`,
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
        href: `${baseUrl}/u/widget/identifier?state=${encodeURIComponent(state)}`,
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
    // POST handler would validate the code and either:
    // 1. Complete login if code is valid
    // 2. Return error if code is invalid/expired
  },
};
