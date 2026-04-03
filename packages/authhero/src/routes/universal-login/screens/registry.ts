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
import { mfaPhoneEnrollmentScreenDefinition } from "./mfa-phone-enrollment";
import { mfaPhoneChallengeScreenDefinition } from "./mfa-phone-challenge";
import { mfaTotpEnrollmentScreenDefinition } from "./mfa-totp-enrollment";
import { mfaTotpChallengeScreenDefinition } from "./mfa-totp-challenge";
import { mfaLoginOptionsScreenDefinition } from "./mfa-login-options";
import { accountScreenDefinition } from "./account";
import { accountProfileScreenDefinition } from "./account-profile";
import { accountSecurityScreenDefinition } from "./account-security";
import { accountLinkedScreenDefinition } from "./account-linked";
import { accountDeleteScreenDefinition } from "./account-delete";
import { accountPasskeysScreenDefinition } from "./account-passkeys";
import { passkeyEnrollmentNudgeScreenDefinition } from "./passkey-enrollment-nudge";
import { passkeyEnrollmentScreenDefinition } from "./passkey-enrollment";

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
  [
    "login-passwordless-identifier",
    loginPasswordlessIdentifierScreenDefinition,
  ],
  ["mfa-phone-enrollment", mfaPhoneEnrollmentScreenDefinition],
  ["mfa-phone-challenge", mfaPhoneChallengeScreenDefinition],
  ["mfa-totp-enrollment", mfaTotpEnrollmentScreenDefinition],
  ["mfa-totp-challenge", mfaTotpChallengeScreenDefinition],
  ["mfa-login-options", mfaLoginOptionsScreenDefinition],
  ["account", accountScreenDefinition],
  ["account-profile", accountProfileScreenDefinition],
  ["account-security", accountSecurityScreenDefinition],
  ["account-linked", accountLinkedScreenDefinition],
  ["account-delete", accountDeleteScreenDefinition],
  ["account-passkeys", accountPasskeysScreenDefinition],
  ["passkey-enrollment-nudge", passkeyEnrollmentNudgeScreenDefinition],
  ["passkey-enrollment", passkeyEnrollmentScreenDefinition],
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
