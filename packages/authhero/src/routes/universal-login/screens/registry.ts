/**
 * Screen Registry - maps screen IDs to their definitions
 */

import type { ScreenDefinition, ScreenContext, ScreenResult } from "./types";
import { identifierScreenDefinition } from "./identifier";
import { enterCodeScreenDefinition } from "./enter-code";
import { enterPasswordScreenDefinition } from "./enter-password";
import { signupScreenDefinition } from "./signup";
import { forgotPasswordScreenDefinition } from "./forgot-password";
import { resetPasswordScreenDefinition } from "./reset-password";
import { impersonateScreenDefinition } from "./impersonate";
import { checkAccountScreenDefinition } from "./check-account";

/**
 * Registry of all built-in screens
 */
export const screenRegistry: Map<string, ScreenDefinition> = new Map([
  ["identifier", identifierScreenDefinition],
  ["enter-code", enterCodeScreenDefinition],
  ["enter-password", enterPasswordScreenDefinition],
  ["signup", signupScreenDefinition],
  ["forgot-password", forgotPasswordScreenDefinition],
  ["reset-password", resetPasswordScreenDefinition],
  ["impersonate", impersonateScreenDefinition],
  ["check-account", checkAccountScreenDefinition],
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
 * @param screenId - The screen ID (e.g., "identifier", "enter-code")
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
