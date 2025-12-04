import bcryptjs from "bcryptjs";
import { JSONHTTPException } from "../errors/json-http-exception";
import { Bindings } from "../types";

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
    throw new JSONHTTPException(400, {
      message: `Password must be at least ${effectiveMinLength} characters.`,
    });
  }

  // Strength
  if (effectivePasswordPolicy && effectivePasswordPolicy !== "none") {
    const strengthRegex =
      effectivePasswordPolicy === "good"
        ? /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/
        : /.*/;
    if (!strengthRegex.test(newPassword)) {
      throw new JSONHTTPException(400, {
        message: `Password does not meet ${effectivePasswordPolicy} requirements.`,
      });
    }
  }

  // History
  if (policy.password_history?.enable) {
    const limit = policy.password_history.size || 5;
    const historical = await data.passwords.list(tenantId, userId, limit);
    for (const p of historical) {
      if (await bcryptjs.compare(newPassword, p.password)) {
        throw new JSONHTTPException(400, {
          message: "Password reused from history.",
        });
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
      throw new JSONHTTPException(400, {
        message: "Password contains personal info.",
      });
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
      throw new JSONHTTPException(400, {
        message: "Password contains forbidden words.",
      });
    }
  }
}

export async function getPasswordPolicy(
  data: Bindings["data"],
  tenantId: string,
  connectionName: string,
): Promise<PasswordPolicy> {
  const connection = await data.connections.get(tenantId, connectionName);
  return (connection?.options as PasswordPolicy) || {};
}
