/**
 * Screen Registry - maps screen IDs to their definitions
 */

import type { ScreenDefinition, ScreenContext, ScreenResult } from "./types";
import { identifierScreenDefinition } from "./identifier";
import { loginScreenDefinition } from "./login";
import { emailOtpChallengeScreenDefinition } from "./email-otp-challenge";
import { smsOtpChallengeScreenDefinition } from "./sms-otp-challenge";
import { enterPasswordScreenDefinition } from "./enter-password";
import { signupScreenDefinition } from "./signup";
import { forgotPasswordScreenDefinition } from "./forgot-password";
import { resetPasswordScreenDefinition } from "./reset-password";
import { impersonateScreenDefinition } from "./impersonate";
import { checkAccountScreenDefinition } from "./check-account";
import { loginPasswordlessIdentifierScreenDefinition } from "./login-passwordless-identifier";

/**
 * Registry of all built-in screens
 */
export const screenRegistry: Map<string, ScreenDefinition> = new Map([
  ["identifier", identifierScreenDefinition],
  ["login", loginScreenDefinition],
  ["email-otp-challenge", emailOtpChallengeScreenDefinition],
  ["sms-otp-challenge", smsOtpChallengeScreenDefinition],
  ["enter-password", enterPasswordScreenDefinition],
  ["signup", signupScreenDefinition],
  ["forgot-password", forgotPasswordScreenDefinition],
  ["reset-password", resetPasswordScreenDefinition],
  ["impersonate", impersonateScreenDefinition],
  ["check-account", checkAccountScreenDefinition],
  ["login-passwordless-identifier", loginPasswordlessIdentifierScreenDefinition],
]);

/**
 * Get a screen definition by ID
 */
export function getScreenDefinition(
  screenId: string,
): ScreenDefinition | undefined {
  return screenRegistry.get(screenId);
}

/**
 * Get a screen by ID
 *
 * @param screenId - The screen ID (e.g., "identifier", "email-otp-challenge")
 * @param context - The screen context with tenant, client, branding, etc.
 * @returns The screen result promise or undefined if not found
 */
export function getScreen(
  screenId: string,
  context: ScreenContext,
): Promise<ScreenResult> | undefined {
  const definition = screenRegistry.get(screenId);
  if (!definition) {
    return undefined;
  }
  return definition.handler.get(context);
}

/**
 * List all available screen IDs
 */
export function listScreenIds(): string[] {
  return Array.from(screenRegistry.keys());
}

/**
 * Check if a screen ID is valid
 */
export function isValidScreenId(screenId: string): boolean {
  return screenRegistry.has(screenId);
}
