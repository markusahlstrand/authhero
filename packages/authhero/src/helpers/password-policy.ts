import bcryptjs from "bcryptjs";
import { Bindings } from "../types";

// Error codes that can be used with i18next translations
export const PASSWORD_ERROR_CODES = {
  TOO_SHORT: "password_too_short",
  MISSING_LOWERCASE: "password_missing_lowercase",
  MISSING_UPPERCASE: "password_missing_uppercase",
  MISSING_NUMBER: "password_missing_number",
  MISSING_SPECIAL: "password_missing_special",
  REUSED: "password_reused",
  CONTAINS_PERSONAL_INFO: "password_contains_personal_info",
  CONTAINS_FORBIDDEN_WORD: "password_contains_forbidden_word",
} as const;

export interface PasswordValidationError {
  code: string;
  message: string;
  params?: Record<string, string | number>;
}

export class PasswordPolicyError extends Error {
  code: string;
  params?: Record<string, string | number>;

  constructor(
    code: string,
    message: string,
    params?: Record<string, string | number>,
  ) {
    super(message);
    this.code = code;
    this.params = params;
    this.name = "PasswordPolicyError";
  }
}

export interface PasswordPolicy {
  passwordPolicy?: string;
  password_complexity_options?: { min_length?: number };
  password_history?: { enable?: boolean; size?: number };
  password_no_personal_info?: { enable?: boolean };
  password_dictionary?: { enable?: boolean; dictionary?: string[] };
}

export interface PasswordValidationOptions {
  tenantId: string;
  userId: string;
  newPassword: string;
  userData?: any;
  data: Bindings["data"];
}

export async function validatePasswordPolicy(
  policy: PasswordPolicy,
  options: PasswordValidationOptions,
): Promise<void> {
  const { newPassword, userData, data, tenantId, userId } = options;

  // Check if policy is empty - apply sensible defaults
  const hasAnyPolicySetting =
    policy.passwordPolicy !== undefined ||
    policy.password_complexity_options !== undefined ||
    policy.password_history !== undefined ||
    policy.password_no_personal_info !== undefined ||
    policy.password_dictionary !== undefined;

  // If no policy settings exist, apply sensible defaults
  const effectivePasswordPolicy = hasAnyPolicySetting
    ? policy.passwordPolicy
    : "good";
  const effectiveMinLength = hasAnyPolicySetting
    ? policy.password_complexity_options?.min_length
    : 8;

  // Min length
  if (effectiveMinLength && newPassword.length < effectiveMinLength) {
    throw new PasswordPolicyError(
      PASSWORD_ERROR_CODES.TOO_SHORT,
      `Password must be at least ${effectiveMinLength} characters`,
      { minLength: effectiveMinLength },
    );
  }

  // Strength - check individual requirements and throw specific error for first missing one
  if (effectivePasswordPolicy && effectivePasswordPolicy !== "none") {
    if (effectivePasswordPolicy === "good") {
      if (!/[a-z]/.test(newPassword)) {
        throw new PasswordPolicyError(
          PASSWORD_ERROR_CODES.MISSING_LOWERCASE,
          "Password must contain at least one lowercase letter",
        );
      }
      if (!/[A-Z]/.test(newPassword)) {
        throw new PasswordPolicyError(
          PASSWORD_ERROR_CODES.MISSING_UPPERCASE,
          "Password must contain at least one uppercase letter",
        );
      }
      if (!/\d/.test(newPassword)) {
        throw new PasswordPolicyError(
          PASSWORD_ERROR_CODES.MISSING_NUMBER,
          "Password must contain at least one number",
        );
      }
      if (!/[^A-Za-z0-9]/.test(newPassword)) {
        throw new PasswordPolicyError(
          PASSWORD_ERROR_CODES.MISSING_SPECIAL,
          "Password must contain at least one special character",
        );
      }
    }
  }

  // History
  if (policy.password_history?.enable) {
    const limit = policy.password_history.size || 5;
    const historical = await data.passwords.list(tenantId, userId, limit);
    for (const p of historical) {
      if (await bcryptjs.compare(newPassword, p.password)) {
        throw new PasswordPolicyError(
          PASSWORD_ERROR_CODES.REUSED,
          "Password was used recently and cannot be reused",
          { historySize: limit },
        );
      }
    }
  }

  // Personal info
  if (policy.password_no_personal_info?.enable && userData) {
    const info = [userData.email, userData.name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (info.includes(newPassword.toLowerCase())) {
      throw new PasswordPolicyError(
        PASSWORD_ERROR_CODES.CONTAINS_PERSONAL_INFO,
        "Password cannot contain personal information like your name or email",
      );
    }
  }

  // Dictionary
  if (
    policy.password_dictionary?.enable &&
    policy.password_dictionary.dictionary
  ) {
    if (
      policy.password_dictionary.dictionary.some((word) =>
        newPassword.toLowerCase().includes(word.toLowerCase()),
      )
    ) {
      throw new PasswordPolicyError(
        PASSWORD_ERROR_CODES.CONTAINS_FORBIDDEN_WORD,
        "Password contains a forbidden word",
      );
    }
  }
}

export async function getPasswordPolicy(
  data: Bindings["data"],
  tenantId: string,
  connectionName: string,
): Promise<PasswordPolicy> {
  // Look up connection by name since user.connection stores the name, not the ID
  const { connections } = await data.connections.list(tenantId, {
    page: 0,
    per_page: 100,
  });
  const connection = connections.find((c) => c.name === connectionName);
  return (connection?.options as PasswordPolicy) || {};
}

/**
 * Hash a password using bcrypt with a cost factor of 10
 */
export async function hashPassword(
  password: string,
): Promise<{ hash: string; algorithm: "bcrypt" }> {
  const hash = await bcryptjs.hash(password, 10);
  return { hash, algorithm: "bcrypt" };
}
