import type { PromptScreen } from "@authhero/adapter-interfaces";

/**
 * Mapping from screen IDs to prompt screen IDs (used for custom text).
 * Shared by the HTML routes (u2-routes.tsx) and the JSON screen API
 * (screen-api.ts) so both render paths load the same tenant overrides.
 */
const SCREEN_TO_PROMPT_MAP: Record<string, PromptScreen> = {
  identifier: "login-id",
  login: "login", // Combined identifier + password screen
  "enter-password": "login-password",
  "email-otp-challenge": "email-otp-challenge",
  "sms-otp-challenge": "email-otp-challenge", // SMS shares email-otp-challenge prompt
  signup: "signup",
  "forgot-password": "reset-password",
  "reset-password": "reset-password",
  "reset-password-code": "reset-password",
  impersonate: "login",
  "pre-signup": "signup-id",
  "pre-signup-sent": "signup",
  consent: "consent",
  "login-passwordless-identifier": "login-passwordless",
  mfa: "mfa",
  "mfa-otp": "mfa-otp",
  "mfa-phone-challenge": "mfa-phone",
  "mfa-totp-enrollment": "mfa-otp",
  "mfa-totp-challenge": "mfa-otp",
  "mfa-email": "mfa-email",
  "mfa-push": "mfa-push",
  "mfa-webauthn": "mfa-webauthn",
  "passkey-enrollment-nudge": "passkeys",
  "passkey-enrollment": "passkeys",
  "passkey-challenge": "passkeys",
  "mfa-voice": "mfa-voice",
  "mfa-phone-enrollment": "mfa-phone",
  "mfa-login-options": "mfa-login-options",
  "mfa-recovery-code": "mfa-recovery-code",
  account: "common",
  "account-profile": "common",
  "account-security": "common",
  "account-mfa-totp-enrollment": "common",
  "account-mfa-phone-enrollment": "common",
  "account-linked": "common",
  "account-delete": "common",
  "account-passkeys": "common",
  status: "status",
  "device-flow": "device-flow",
  "connect-consent": "consent",
  "connect-tenant-select": "consent",
  "email-verification": "email-verification",
  "email-verification-code": "email-verification",
  "email-verification-link-sent": "email-verification",
  organizations: "organizations",
  invitation: "invitation",
  "accept-invitation": "invitation",
};

export function getPromptScreenForScreen(
  screenId: string,
): PromptScreen | undefined {
  return SCREEN_TO_PROMPT_MAP[screenId];
}
