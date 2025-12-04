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

  // Min length
  if (
    policy.password_complexity_options?.min_length &&
    newPassword.length < policy.password_complexity_options.min_length
  ) {
    throw new JSONHTTPException(400, {
      message: `Password must be at least ${policy.password_complexity_options.min_length} characters.`,
    });
  }

  // Strength
  if (policy.passwordPolicy && policy.passwordPolicy !== "none") {
    const strengthRegex =
      policy.passwordPolicy === "good"
        ? /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/
        : /.*/;
    if (!strengthRegex.test(newPassword)) {
      throw new JSONHTTPException(400, {
        message: `Password does not meet ${policy.passwordPolicy} requirements.`,
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
