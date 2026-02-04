/**
 * Utilities for applying custom text to screens
 */

import type { CustomText } from "@authhero/adapter-interfaces";

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Get a custom text value with variable substitution
 * Variables are in the format ${variableName}
 *
 * @param customText - The custom text object (key-value pairs)
 * @param key - The key to look up
 * @param defaultValue - The default value if key is not found
 * @param variables - Variables to substitute (e.g., { clientName: "My App" })
 * @returns The custom text with variables substituted, or the default value
 */
export function getCustomText(
  customText: CustomText | undefined,
  key: string,
  defaultValue: string,
  variables?: Record<string, string | undefined>,
): string {
  let text = customText?.[key] ?? defaultValue;

  // Substitute variables
  if (variables) {
    for (const [varName, varValue] of Object.entries(variables)) {
      if (varValue !== undefined) {
        const escapedVarName = escapeRegExp(varName);
        // Support both ${var} and #{var} syntax (Auth0 uses both)
        text = text
          .replace(new RegExp(`\\$\\{${escapedVarName}\\}`, "g"), varValue)
          .replace(new RegExp(`#\\{${escapedVarName}\\}`, "g"), varValue);
      }
    }
  }

  return text;
}

/**
 * Get an error message from custom text
 * Error keys are typically prefixed with the error type (e.g., "wrong-credentials")
 *
 * @param customText - The custom text object
 * @param errorKey - The error key (e.g., "wrong-credentials", "invalid-email-format")
 * @param defaultMessage - The default error message
 * @param variables - Variables to substitute
 */
export function getErrorText(
  customText: CustomText | undefined,
  errorKey: string,
  defaultMessage: string,
  variables?: Record<string, string | undefined>,
): string {
  return getCustomText(customText, errorKey, defaultMessage, variables);
}

/**
 * Common text keys for login screens
 */
export const LOGIN_TEXT_KEYS = {
  // Page
  PAGE_TITLE: "pageTitle",
  TITLE: "title",
  DESCRIPTION: "description",

  // Buttons
  BUTTON_TEXT: "buttonText",
  FEDERATED_CONNECTION_BUTTON_TEXT: "federatedConnectionButtonText",

  // Links
  FOOTER_LINK_TEXT: "footerLinkText",
  SIGNUP_ACTION_LINK_TEXT: "signupActionLinkText",
  FOOTER_TEXT: "footerText",
  SIGNUP_ACTION_TEXT: "signupActionText",
  FORGOT_PASSWORD_TEXT: "forgotPasswordText",

  // Input placeholders
  PASSWORD_PLACEHOLDER: "passwordPlaceholder",
  USERNAME_PLACEHOLDER: "usernamePlaceholder",
  EMAIL_PLACEHOLDER: "emailPlaceholder",
  PHONE_PLACEHOLDER: "phonePlaceholder",

  // Other
  SEPARATOR_TEXT: "separatorText",
  EDIT_EMAIL_TEXT: "editEmailText",
  SHOW_PASSWORD_TEXT: "showPasswordText",
  HIDE_PASSWORD_TEXT: "hidePasswordText",
};

/**
 * Common error keys for login screens
 */
export const LOGIN_ERROR_KEYS = {
  WRONG_CREDENTIALS: "wrong-credentials",
  WRONG_EMAIL_CREDENTIALS: "wrong-email-credentials",
  WRONG_USERNAME_CREDENTIALS: "wrong-username-credentials",
  WRONG_PHONE_CREDENTIALS: "wrong-phone-credentials",
  INVALID_CODE: "invalid-code",
  INVALID_EMAIL_FORMAT: "invalid-email-format",
  NO_EMAIL: "no-email",
  NO_PASSWORD: "no-password",
  NO_USERNAME: "no-username",
  USER_BLOCKED: "user-blocked",
  PASSWORD_BREACHED: "password-breached",
  AUTHENTICATION_FAILURE: "authentication-failure",
};
