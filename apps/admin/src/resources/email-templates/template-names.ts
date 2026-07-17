import type { EmailTemplateName } from "@authhero/adapter-interfaces";

export const EMAIL_TEMPLATE_DEFINITIONS: ReadonlyArray<{
  name: EmailTemplateName;
  label: string;
  description: string;
}> = [
  {
    name: "verify_email",
    label: "Verification Email (Link)",
    description: "Sent when a new user signs up. Contains a magic link.",
  },
  {
    name: "verify_email_by_code",
    label: "Verification Email (Code)",
    description: "Sent when a new user signs up. Contains a one-time code.",
  },
  {
    name: "reset_email",
    label: "Password Reset (Link)",
    description: "Sent when a user requests a password reset via link.",
  },
  {
    name: "reset_email_by_code",
    label: "Password Reset (Code)",
    description: "Sent when a user requests a password reset via code.",
  },
  {
    name: "welcome_email",
    label: "Welcome Email",
    description: "Sent after a user successfully verifies their account.",
  },
  {
    name: "user_invitation",
    label: "User Invitation",
    description: "Sent when a user is invited to an organization.",
  },
  {
    name: "blocked_account",
    label: "Blocked Account",
    description: "Sent when an account is blocked due to suspicious activity.",
  },
  {
    name: "stolen_credentials",
    label: "Stolen Credentials",
    description:
      "Sent when a user's credentials have been detected in a breach.",
  },
  {
    name: "enrollment_email",
    label: "MFA Enrollment",
    description: "Sent when a user is enrolling into multi-factor auth.",
  },
  {
    name: "mfa_oob_code",
    label: "MFA One-Time Code",
    description: "Sent during multi-factor authentication challenges.",
  },
  {
    name: "change_password",
    label: "Change Password (Legacy)",
    description: "Legacy template kept for backwards compatibility with Auth0.",
  },
  {
    name: "password_reset",
    label: "Password Reset (Legacy)",
    description: "Legacy template kept for backwards compatibility with Auth0.",
  },
];

export const EMAIL_TEMPLATE_NAMES: ReadonlyArray<EmailTemplateName> =
  EMAIL_TEMPLATE_DEFINITIONS.map((d) => d.name);

export function getTemplateLabel(name: string): string {
  return EMAIL_TEMPLATE_DEFINITIONS.find((d) => d.name === name)?.label ?? name;
}

export function getTemplateDescription(name: string): string {
  return (
    EMAIL_TEMPLATE_DEFINITIONS.find((d) => d.name === name)?.description ?? ""
  );
}
