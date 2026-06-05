import { z } from "@hono/zod-openapi";

// Define the LogTypes enum object with all Auth0 log type codes
export const LogTypes = {
  // Network & System
  ACLS_SUMMARY: "acls_summary",
  ACTIONS_EXECUTION_FAILED: "actions_execution_failed",
  API_LIMIT: "api_limit",
  API_LIMIT_WARNING: "api_limit_warning",
  APPI: "appi",

  // CIBA (Client-Initiated Backchannel Authentication)
  CIBA_EXCHANGE_FAILED: "ciba_exchange_failed",
  CIBA_EXCHANGE_SUCCEEDED: "ciba_exchange_succeeded",
  CIBA_START_FAILED: "ciba_start_failed",
  CIBA_START_SUCCEEDED: "ciba_start_succeeded",

  // Code/Link sending
  CODE_LINK_SENT: "cls",
  CODE_SENT: "cs",

  // Deprecation & System notices
  DEPRECATION_NOTICE: "depnote",

  // Failed operations
  FAILED_LOGIN: "f",
  FAILED_BY_CONNECTOR: "fc",
  FAILED_CHANGE_EMAIL: "fce",
  FAILED_BY_CORS: "fco",
  FAILED_CROSS_ORIGIN_AUTHENTICATION: "fcoa",
  FAILED_CHANGE_PASSWORD: "fcp",
  FAILED_POST_CHANGE_PASSWORD_HOOK: "fcph",
  FAILED_CHANGE_PHONE_NUMBER: "fcpn",
  FAILED_CHANGE_PASSWORD_REQUEST: "fcpr",
  FAILED_CONNECTOR_PROVISIONING: "fcpro",
  FAILED_CHANGE_USERNAME: "fcu",
  FAILED_DELEGATION: "fd",
  FAILED_DEVICE_ACTIVATION: "fdeac",
  FAILED_DEVICE_AUTHORIZATION_REQUEST: "fdeaz",
  USER_CANCELED_DEVICE_CONFIRMATION: "fdecc",
  FAILED_USER_DELETION: "fdu",
  FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN: "feacft",
  FAILED_EXCHANGE_ACCESS_TOKEN_FOR_CLIENT_CREDENTIALS: "feccft",
  FAILED_EXCHANGE_CUSTOM_TOKEN: "fecte",
  FAILED_EXCHANGE_DEVICE_CODE_FOR_ACCESS_TOKEN: "fede",
  FAILED_FEDERATED_LOGOUT: "federated_logout_failed",
  FAILED_EXCHANGE_NATIVE_SOCIAL_LOGIN: "fens",
  FAILED_EXCHANGE_PASSWORD_OOB_FOR_ACCESS_TOKEN: "feoobft",
  FAILED_EXCHANGE_PASSWORD_OTP_FOR_ACCESS_TOKEN: "feotpft",
  FAILED_EXCHANGE_PASSWORD_FOR_ACCESS_TOKEN: "fepft",
  FAILED_EXCHANGE_PASSWORDLESS_OTP_FOR_ACCESS_TOKEN: "fepotpft",
  FAILED_EXCHANGE_PASSWORD_MFA_RECOVERY_FOR_ACCESS_TOKEN: "fercft",
  FAILED_EXCHANGE_ROTATING_REFRESH_TOKEN: "ferrt",
  FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN: "fertft",
  FAILED_EXCHANGE_SUBJECT_TOKEN_FOR_ACCESS_TOKEN: "festft",
  FAILED_HOOK: "fh", // Custom AuthHero-specific
  FAILED_IMPERSONATION: "fimp", // Custom AuthHero-specific
  FAILED_INVITE_ACCEPT: "fi",
  FAILED_LOGOUT: "flo",
  FLOWS_EXECUTION_COMPLETED: "flows_execution_completed",
  FLOWS_EXECUTION_FAILED: "flows_execution_failed",
  FAILED_SENDING_NOTIFICATION: "fn",
  FORMS_SUBMISSION_FAILED: "forms_submission_failed",
  FORMS_SUBMISSION_SUCCEEDED: "forms_submission_succeeded",
  FAILED_LOGIN_INCORRECT_PASSWORD: "fp",
  FAILED_PUSHED_AUTHORIZATION_REQUEST: "fpar",
  FAILED_POST_USER_REGISTRATION_HOOK: "fpurh",
  FAILED_SIGNUP: "fs",
  FAILED_SILENT_AUTH: "fsa",
  FAILED_LOGIN_INVALID_EMAIL_USERNAME: "fu",
  FAILED_USERS_IMPORT: "fui",
  FAILED_VERIFICATION_EMAIL: "fv",
  FAILED_VERIFICATION_EMAIL_REQUEST: "fvr",

  // Guardian/MFA events
  EMAIL_VERIFICATION_CONFIRMED: "gd_auth_email_verification",
  EMAIL_VERIFICATION_FAILED: "gd_auth_fail_email_verification",
  MFA_AUTH_FAILED: "gd_auth_failed",
  MFA_AUTH_REJECTED: "gd_auth_rejected",
  MFA_AUTH_SUCCESS: "gd_auth_succeed",
  MFA_ENROLLMENT_COMPLETE: "gd_enrollment_complete",
  TOO_MANY_MFA_FAILURES: "gd_otp_rate_limit_exceed",
  MFA_RECOVERY_FAILED: "gd_recovery_failed",
  MFA_RECOVERY_RATE_LIMIT_EXCEED: "gd_recovery_rate_limit_exceed",
  MFA_RECOVERY_SUCCESS: "gd_recovery_succeed",
  MFA_EMAIL_SENT: "gd_send_email",
  EMAIL_VERIFICATION_SENT: "gd_send_email_verification",
  EMAIL_VERIFICATION_SEND_FAILURE: "gd_send_email_verification_failure",
  PUSH_NOTIFICATION_SENT: "gd_send_pn",
  ERROR_SENDING_MFA_PUSH_NOTIFICATION: "gd_send_pn_failure",
  MFA_SMS_SENT: "gd_send_sms",
  ERROR_SENDING_MFA_SMS: "gd_send_sms_failure",
  MFA_VOICE_CALL_SUCCESS: "gd_send_voice",
  MFA_VOICE_CALL_FAILED: "gd_send_voice_failure",
  SECOND_FACTOR_STARTED: "gd_start_auth",
  MFA_ENROLL_STARTED: "gd_start_enroll",
  MFA_ENROLLMENT_FAILED: "gd_start_enroll_failed",
  GUARDIAN_TENANT_UPDATE: "gd_tenant_update",
  UNENROLL_DEVICE_ACCOUNT: "gd_unenroll",
  UPDATE_DEVICE_ACCOUNT: "gd_update_device_account",
  WEBAUTHN_CHALLENGE_FAILED: "gd_webauthn_challenge_failed",
  WEBAUTHN_ENROLLMENT_FAILED: "gd_webauthn_enrollment_failed",

  // KMS operations
  FAILED_KMS_API_OPERATION: "kms_key_management_failure",
  SUCCESS_KMS_API_OPERATION: "kms_key_management_success",
  KMS_KEY_STATE_CHANGED: "kms_key_state_changed",

  // Rate limiting & blocking
  TOO_MANY_CALLS_TO_DELEGATION: "limit_delegation",
  BLOCKED_IP_ADDRESS: "limit_mu",
  BLOCKED_ACCOUNT_IP: "limit_sul",
  BLOCKED_ACCOUNT_EMAIL: "limit_wc",

  // Generic information
  INFORMATION: "i",

  // MFA & My Account
  MFA_REQUIRED: "mfar",
  MANAGEMENT_API_READ_OPERATION: "mgmt_api_read",
  FAILED_AUTHENTICATION_METHOD_OPERATION_MY_ACCOUNT:
    "my_account_authentication_method_failed",
  SUCCESSFUL_AUTHENTICATION_METHOD_OPERATION_MY_ACCOUNT:
    "my_account_authentication_method_succeeded",

  // OIDC operations
  FAILED_OIDC_BACKCHANNEL_LOGOUT: "oidc_backchannel_logout_failed",
  SUCCESSFUL_OIDC_BACKCHANNEL_LOGOUT: "oidc_backchannel_logout_succeeded",

  // Organization
  ORGANIZATION_MEMBER_ADDED: "organization_member_added",

  // Passkey operations
  PASSKEY_CHALLENGE_FAILED: "passkey_challenge_failed",
  PASSKEY_CHALLENGE_STARTED: "passkey_challenge_started",

  // Security & password events
  PRE_LOGIN_ASSESSMENT: "pla",
  BREACHED_PASSWORD: "pwd_leak",
  BREACHED_PASSWORD_ON_RESET: "reset_pwd_leak",
  SUCCESS_RESOURCE_CLEANUP: "resource_cleanup",
  RICH_CONSENTS_ACCESS_ERROR: "rich_consents_access_error",

  // Successful operations
  SUCCESS_LOGIN: "s",
  SUCCESS_API_OPERATION: "sapi",
  FAILED_API_OPERATION: "fapi",
  SUCCESS_CHANGE_EMAIL: "sce",
  SUCCESS_CROSS_ORIGIN_AUTHENTICATION: "scoa",
  SUCCESS_CHANGE_PASSWORD: "scp",
  SUCCESS_CHANGE_PHONE_NUMBER: "scpn",
  SUCCESS_CHANGE_PASSWORD_REQUEST: "scpr",
  SUCCESS_CHANGE_USERNAME: "scu",
  SUCCESS_CREDENTIAL_VALIDATION: "scv",
  SUCCESS_DELEGATION: "sd",
  SUCCESS_USER_DELETION: "sdu",
  SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN: "seacft",
  SUCCESS_EXCHANGE_ACCESS_TOKEN_FOR_CLIENT_CREDENTIALS: "seccft",
  SUCCESS_EXCHANGE_CUSTOM_TOKEN: "secte",
  SUCCESS_EXCHANGE_DEVICE_CODE_FOR_ACCESS_TOKEN: "sede",
  SUCCESS_EXCHANGE_NATIVE_SOCIAL_LOGIN: "sens",
  SUCCESS_EXCHANGE_PASSWORD_OOB_FOR_ACCESS_TOKEN: "seoobft",
  SUCCESS_EXCHANGE_PASSWORD_OTP_FOR_ACCESS_TOKEN: "seotpft",
  SUCCESS_EXCHANGE_PASSWORDLESS_OTP_FOR_ACCESS_TOKEN: "sepotpft",
  SUCCESS_EXCHANGE_PASSWORD_FOR_ACCESS_TOKEN: "sepft",
  SUCCESS_EXCHANGE_PASSKEY_OOB_FOR_ACCESS_TOKEN: "sepkoobft",
  SUCCESS_EXCHANGE_PASSKEY_OTP_FOR_ACCESS_TOKEN: "sepkotpft",
  SUCCESS_EXCHANGE_PASSKEY_MFA_RECOVERY_FOR_ACCESS_TOKEN: "sepkrcft",
  SUCCESS_EXCHANGE_PASSWORD_MFA_RECOVERY_FOR_ACCESS_TOKEN: "sercft",
  SUCCESS_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN: "sertft",
  SUCCESS_EXCHANGE_SUBJECT_TOKEN_FOR_ACCESS_TOKEN: "sestft",
  SUCCESS_IMPERSONATION: "simp", // Custom AuthHero-specific
  SUCCESSFULLY_ACCEPTED_USER_INVITE: "si",
  BREACHED_PASSWORD_ON_SIGNUP: "signup_pwd_leak",
  SUCCESS_LOGOUT: "slo",
  SUCCESS_HOOK: "sh", // Custom AuthHero-specific
  SUCCESS_PASSWORD_MIGRATION: "spm", // Custom AuthHero-specific: upstream password successfully imported
  SUCCESS_REVOCATION: "srrt",
  SUCCESS_SIGNUP: "ss",
  FAILED_SS_SSO_OPERATION: "ss_sso_failure",
  INFORMATION_FROM_SS_SSO_OPERATION: "ss_sso_info",
  SUCCESS_SS_SSO_OPERATION: "ss_sso_success",
  SUCCESS_SILENT_AUTH: "ssa",
  SUCCESSFUL_SCIM_OPERATION: "sscim",
  SUCCESSFULLY_IMPORTED_USERS: "sui",
  SUCCESS_VERIFICATION_EMAIL: "sv",
  SUCCESS_VERIFICATION_EMAIL_REQUEST: "svr",

  // Warnings & misc
  MAX_AMOUNT_OF_AUTHENTICATORS: "too_many_records",
  USER_LOGIN_BLOCK_RELEASED: "ublkdu",
  FAILED_UNIVERSAL_LOGOUT: "universal_logout_failed",
  SUCCESSFUL_UNIVERSAL_LOGOUT: "universal_logout_succeeded",
  WARNING_DURING_LOGIN: "w",
  WARNING_SENDING_NOTIFICATION: "wn",
  WARNING_USER_MANAGEMENT: "wum",
} as const;

// Create a simple Zod string validation that accepts any of the LogTypes values
const LogType = z
  .string()
  .refine(
    (val): val is (typeof LogTypes)[keyof typeof LogTypes] =>
      Object.values(LogTypes).includes(val as any),
    { message: "Invalid log type" },
  );

export type LogType = (typeof LogTypes)[keyof typeof LogTypes];

export type LogCategory =
  | "success"
  | "failure"
  | "warning"
  | "info"
  | "code_sent"
  | "other";

// Human-readable descriptions for each log type code. Keyed by the code
// (the string value), so consumers that already have a raw `log.type` string
// can look up a label without importing the enum.
export const logTypeDescriptions: Record<string, string> = {
  [LogTypes.ACLS_SUMMARY]: "ACLs Summary",
  [LogTypes.ACTIONS_EXECUTION_FAILED]: "Actions Execution Failed",
  [LogTypes.API_LIMIT]: "API Rate Limit Reached",
  [LogTypes.API_LIMIT_WARNING]: "API Rate Limit Warning",
  [LogTypes.APPI]: "API Operation",
  [LogTypes.CIBA_EXCHANGE_FAILED]: "CIBA Exchange Failed",
  [LogTypes.CIBA_EXCHANGE_SUCCEEDED]: "CIBA Exchange Succeeded",
  [LogTypes.CIBA_START_FAILED]: "CIBA Start Failed",
  [LogTypes.CIBA_START_SUCCEEDED]: "CIBA Start Succeeded",
  [LogTypes.CODE_LINK_SENT]: "Code/Link Sent",
  [LogTypes.CODE_SENT]: "Code Sent",
  [LogTypes.DEPRECATION_NOTICE]: "Deprecation Notice",
  [LogTypes.FAILED_LOGIN]: "Failed Login",
  [LogTypes.FAILED_BY_CONNECTOR]: "Failed by Connector",
  [LogTypes.FAILED_CHANGE_EMAIL]: "Failed Change Email",
  [LogTypes.FAILED_BY_CORS]: "Failed by CORS",
  [LogTypes.FAILED_CROSS_ORIGIN_AUTHENTICATION]:
    "Failed Cross Origin Authentication",
  [LogTypes.FAILED_CHANGE_PASSWORD]: "Failed Change Password",
  [LogTypes.FAILED_POST_CHANGE_PASSWORD_HOOK]:
    "Failed Post-Change Password Hook",
  [LogTypes.FAILED_CHANGE_PHONE_NUMBER]: "Failed Change Phone Number",
  [LogTypes.FAILED_CHANGE_PASSWORD_REQUEST]: "Failed Change Password Request",
  [LogTypes.FAILED_CONNECTOR_PROVISIONING]: "Failed Connector Provisioning",
  [LogTypes.FAILED_CHANGE_USERNAME]: "Failed Change Username",
  [LogTypes.FAILED_DELEGATION]: "Failed Delegation",
  [LogTypes.FAILED_DEVICE_ACTIVATION]: "Failed Device Activation",
  [LogTypes.FAILED_DEVICE_AUTHORIZATION_REQUEST]:
    "Failed Device Authorization Request",
  [LogTypes.USER_CANCELED_DEVICE_CONFIRMATION]:
    "User Canceled Device Confirmation",
  [LogTypes.FAILED_USER_DELETION]: "Failed User Deletion",
  [LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN]:
    "Failed Exchange Authorization Code for Access Token",
  [LogTypes.FAILED_EXCHANGE_ACCESS_TOKEN_FOR_CLIENT_CREDENTIALS]:
    "Failed Exchange Access Token for Client Credentials",
  [LogTypes.FAILED_EXCHANGE_CUSTOM_TOKEN]: "Failed Exchange Custom Token",
  [LogTypes.FAILED_EXCHANGE_DEVICE_CODE_FOR_ACCESS_TOKEN]:
    "Failed Exchange Device Code for Access Token",
  [LogTypes.FAILED_FEDERATED_LOGOUT]: "Failed Federated Logout",
  [LogTypes.FAILED_EXCHANGE_NATIVE_SOCIAL_LOGIN]:
    "Failed Exchange Native Social Login",
  [LogTypes.FAILED_EXCHANGE_PASSWORD_OOB_FOR_ACCESS_TOKEN]:
    "Failed Exchange Password OOB for Access Token",
  [LogTypes.FAILED_EXCHANGE_PASSWORD_OTP_FOR_ACCESS_TOKEN]:
    "Failed Exchange Password OTP for Access Token",
  [LogTypes.FAILED_EXCHANGE_PASSWORD_FOR_ACCESS_TOKEN]:
    "Failed Exchange Password for Access Token",
  [LogTypes.FAILED_EXCHANGE_PASSWORDLESS_OTP_FOR_ACCESS_TOKEN]:
    "Failed Exchange Passwordless OTP for Access Token",
  [LogTypes.FAILED_EXCHANGE_PASSWORD_MFA_RECOVERY_FOR_ACCESS_TOKEN]:
    "Failed Exchange Password MFA Recovery for Access Token",
  [LogTypes.FAILED_EXCHANGE_ROTATING_REFRESH_TOKEN]:
    "Failed Exchange Rotating Refresh Token",
  [LogTypes.FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN]:
    "Failed Exchange Refresh Token for Access Token",
  [LogTypes.FAILED_EXCHANGE_SUBJECT_TOKEN_FOR_ACCESS_TOKEN]:
    "Failed Exchange Subject Token for Access Token",
  [LogTypes.FAILED_HOOK]: "Failed Hook",
  [LogTypes.FAILED_IMPERSONATION]: "Failed Impersonation",
  [LogTypes.FAILED_INVITE_ACCEPT]: "Failed Invite Accept",
  [LogTypes.FAILED_LOGOUT]: "Failed Logout",
  [LogTypes.FLOWS_EXECUTION_COMPLETED]: "Flows Execution Completed",
  [LogTypes.FLOWS_EXECUTION_FAILED]: "Flows Execution Failed",
  [LogTypes.FAILED_SENDING_NOTIFICATION]: "Failed Sending Notification",
  [LogTypes.FORMS_SUBMISSION_FAILED]: "Forms Submission Failed",
  [LogTypes.FORMS_SUBMISSION_SUCCEEDED]: "Forms Submission Succeeded",
  [LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD]:
    "Failed Login - Incorrect Password",
  [LogTypes.FAILED_PUSHED_AUTHORIZATION_REQUEST]:
    "Failed Pushed Authorization Request",
  [LogTypes.FAILED_POST_USER_REGISTRATION_HOOK]:
    "Failed Post-User Registration Hook",
  [LogTypes.FAILED_SIGNUP]: "Failed Signup",
  [LogTypes.FAILED_SILENT_AUTH]: "Failed Silent Auth",
  [LogTypes.FAILED_LOGIN_INVALID_EMAIL_USERNAME]:
    "Failed Login - Invalid Email/Username",
  [LogTypes.FAILED_USERS_IMPORT]: "Failed Users Import",
  [LogTypes.FAILED_VERIFICATION_EMAIL]: "Failed Verification Email",
  [LogTypes.FAILED_VERIFICATION_EMAIL_REQUEST]:
    "Failed Verification Email Request",
  [LogTypes.EMAIL_VERIFICATION_CONFIRMED]: "Email Verification Confirmed",
  [LogTypes.EMAIL_VERIFICATION_FAILED]: "Email Verification Failed",
  [LogTypes.MFA_AUTH_FAILED]: "MFA Auth Failed",
  [LogTypes.MFA_AUTH_REJECTED]: "MFA Auth Rejected",
  [LogTypes.MFA_AUTH_SUCCESS]: "MFA Auth Success",
  [LogTypes.MFA_ENROLLMENT_COMPLETE]: "MFA Enrollment Complete",
  [LogTypes.TOO_MANY_MFA_FAILURES]: "Too Many MFA Failures",
  [LogTypes.MFA_RECOVERY_FAILED]: "MFA Recovery Failed",
  [LogTypes.MFA_RECOVERY_RATE_LIMIT_EXCEED]: "MFA Recovery Rate Limit Exceeded",
  [LogTypes.MFA_RECOVERY_SUCCESS]: "MFA Recovery Success",
  [LogTypes.MFA_EMAIL_SENT]: "MFA Email Sent",
  [LogTypes.EMAIL_VERIFICATION_SENT]: "Email Verification Sent",
  [LogTypes.EMAIL_VERIFICATION_SEND_FAILURE]: "Email Verification Send Failure",
  [LogTypes.PUSH_NOTIFICATION_SENT]: "Push Notification Sent",
  [LogTypes.ERROR_SENDING_MFA_PUSH_NOTIFICATION]:
    "Error Sending MFA Push Notification",
  [LogTypes.MFA_SMS_SENT]: "MFA SMS Sent",
  [LogTypes.ERROR_SENDING_MFA_SMS]: "Error Sending MFA SMS",
  [LogTypes.MFA_VOICE_CALL_SUCCESS]: "MFA Voice Call Success",
  [LogTypes.MFA_VOICE_CALL_FAILED]: "MFA Voice Call Failed",
  [LogTypes.SECOND_FACTOR_STARTED]: "Second Factor Started",
  [LogTypes.MFA_ENROLL_STARTED]: "MFA Enroll Started",
  [LogTypes.MFA_ENROLLMENT_FAILED]: "MFA Enrollment Failed",
  [LogTypes.GUARDIAN_TENANT_UPDATE]: "Guardian Tenant Update",
  [LogTypes.UNENROLL_DEVICE_ACCOUNT]: "Unenroll Device Account",
  [LogTypes.UPDATE_DEVICE_ACCOUNT]: "Update Device Account",
  [LogTypes.WEBAUTHN_CHALLENGE_FAILED]: "WebAuthn Challenge Failed",
  [LogTypes.WEBAUTHN_ENROLLMENT_FAILED]: "WebAuthn Enrollment Failed",
  [LogTypes.FAILED_KMS_API_OPERATION]: "Failed KMS API Operation",
  [LogTypes.SUCCESS_KMS_API_OPERATION]: "Success KMS API Operation",
  [LogTypes.KMS_KEY_STATE_CHANGED]: "KMS Key State Changed",
  [LogTypes.TOO_MANY_CALLS_TO_DELEGATION]: "Too Many Calls to Delegation",
  [LogTypes.BLOCKED_IP_ADDRESS]: "Blocked IP Address",
  [LogTypes.BLOCKED_ACCOUNT_IP]: "Blocked Account (IP)",
  [LogTypes.BLOCKED_ACCOUNT_EMAIL]: "Blocked Account (Email)",
  [LogTypes.INFORMATION]: "Information",
  [LogTypes.MFA_REQUIRED]: "MFA Required",
  [LogTypes.MANAGEMENT_API_READ_OPERATION]: "Management API Read Operation",
  [LogTypes.FAILED_AUTHENTICATION_METHOD_OPERATION_MY_ACCOUNT]:
    "Failed Authentication Method Operation (My Account)",
  [LogTypes.SUCCESSFUL_AUTHENTICATION_METHOD_OPERATION_MY_ACCOUNT]:
    "Successful Authentication Method Operation (My Account)",
  [LogTypes.FAILED_OIDC_BACKCHANNEL_LOGOUT]: "Failed OIDC Backchannel Logout",
  [LogTypes.SUCCESSFUL_OIDC_BACKCHANNEL_LOGOUT]:
    "Successful OIDC Backchannel Logout",
  [LogTypes.ORGANIZATION_MEMBER_ADDED]: "Organization Member Added",
  [LogTypes.PASSKEY_CHALLENGE_FAILED]: "Passkey Challenge Failed",
  [LogTypes.PASSKEY_CHALLENGE_STARTED]: "Passkey Challenge Started",
  [LogTypes.PRE_LOGIN_ASSESSMENT]: "Pre-Login Assessment",
  [LogTypes.BREACHED_PASSWORD]: "Breached Password",
  [LogTypes.BREACHED_PASSWORD_ON_RESET]: "Breached Password on Reset",
  [LogTypes.SUCCESS_RESOURCE_CLEANUP]: "Success Resource Cleanup",
  [LogTypes.RICH_CONSENTS_ACCESS_ERROR]: "Rich Consents Access Error",
  [LogTypes.SUCCESS_LOGIN]: "Success Login",
  [LogTypes.SUCCESS_API_OPERATION]: "Success API Operation",
  [LogTypes.FAILED_API_OPERATION]: "Failed API Operation",
  [LogTypes.SUCCESS_CHANGE_EMAIL]: "Success Change Email",
  [LogTypes.SUCCESS_CROSS_ORIGIN_AUTHENTICATION]:
    "Success Cross Origin Authentication",
  [LogTypes.SUCCESS_CHANGE_PASSWORD]: "Success Change Password",
  [LogTypes.SUCCESS_CHANGE_PHONE_NUMBER]: "Success Change Phone Number",
  [LogTypes.SUCCESS_CHANGE_PASSWORD_REQUEST]: "Success Change Password Request",
  [LogTypes.SUCCESS_CHANGE_USERNAME]: "Success Change Username",
  [LogTypes.SUCCESS_CREDENTIAL_VALIDATION]: "Success Credential Validation",
  [LogTypes.SUCCESS_DELEGATION]: "Success Delegation",
  [LogTypes.SUCCESS_USER_DELETION]: "Success User Deletion",
  [LogTypes.SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN]:
    "Success Exchange Authorization Code for Access Token",
  [LogTypes.SUCCESS_EXCHANGE_ACCESS_TOKEN_FOR_CLIENT_CREDENTIALS]:
    "Success Exchange Access Token for Client Credentials",
  [LogTypes.SUCCESS_EXCHANGE_CUSTOM_TOKEN]: "Success Exchange Custom Token",
  [LogTypes.SUCCESS_EXCHANGE_DEVICE_CODE_FOR_ACCESS_TOKEN]:
    "Success Exchange Device Code for Access Token",
  [LogTypes.SUCCESS_EXCHANGE_NATIVE_SOCIAL_LOGIN]:
    "Success Exchange Native Social Login",
  [LogTypes.SUCCESS_EXCHANGE_PASSWORD_OOB_FOR_ACCESS_TOKEN]:
    "Success Exchange Password OOB for Access Token",
  [LogTypes.SUCCESS_EXCHANGE_PASSWORD_OTP_FOR_ACCESS_TOKEN]:
    "Success Exchange Password OTP for Access Token",
  [LogTypes.SUCCESS_EXCHANGE_PASSWORDLESS_OTP_FOR_ACCESS_TOKEN]:
    "Success Exchange Passwordless OTP for Access Token",
  [LogTypes.SUCCESS_EXCHANGE_PASSWORD_FOR_ACCESS_TOKEN]:
    "Success Exchange Password for Access Token",
  [LogTypes.SUCCESS_EXCHANGE_PASSKEY_OOB_FOR_ACCESS_TOKEN]:
    "Success Exchange Passkey OOB for Access Token",
  [LogTypes.SUCCESS_EXCHANGE_PASSKEY_OTP_FOR_ACCESS_TOKEN]:
    "Success Exchange Passkey OTP for Access Token",
  [LogTypes.SUCCESS_EXCHANGE_PASSKEY_MFA_RECOVERY_FOR_ACCESS_TOKEN]:
    "Success Exchange Passkey MFA Recovery for Access Token",
  [LogTypes.SUCCESS_EXCHANGE_PASSWORD_MFA_RECOVERY_FOR_ACCESS_TOKEN]:
    "Success Exchange Password MFA Recovery for Access Token",
  [LogTypes.SUCCESS_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN]:
    "Success Exchange Refresh Token for Access Token",
  [LogTypes.SUCCESS_EXCHANGE_SUBJECT_TOKEN_FOR_ACCESS_TOKEN]:
    "Success Exchange Subject Token for Access Token",
  [LogTypes.SUCCESS_IMPERSONATION]: "Success Impersonation",
  [LogTypes.SUCCESSFULLY_ACCEPTED_USER_INVITE]:
    "Successfully Accepted User Invite",
  [LogTypes.BREACHED_PASSWORD_ON_SIGNUP]: "Breached Password on Signup",
  [LogTypes.SUCCESS_LOGOUT]: "Success Logout",
  [LogTypes.SUCCESS_HOOK]: "Success Hook",
  [LogTypes.SUCCESS_PASSWORD_MIGRATION]: "Success Password Migration",
  [LogTypes.SUCCESS_REVOCATION]: "Success Revocation",
  [LogTypes.SUCCESS_SIGNUP]: "Success Signup",
  [LogTypes.FAILED_SS_SSO_OPERATION]: "Failed SS SSO Operation",
  [LogTypes.INFORMATION_FROM_SS_SSO_OPERATION]:
    "Information from SS SSO Operation",
  [LogTypes.SUCCESS_SS_SSO_OPERATION]: "Success SS SSO Operation",
  [LogTypes.SUCCESS_SILENT_AUTH]: "Success Silent Auth",
  [LogTypes.SUCCESSFUL_SCIM_OPERATION]: "Successful SCIM Operation",
  [LogTypes.SUCCESSFULLY_IMPORTED_USERS]: "Successfully Imported Users",
  [LogTypes.SUCCESS_VERIFICATION_EMAIL]: "Success Verification Email",
  [LogTypes.SUCCESS_VERIFICATION_EMAIL_REQUEST]:
    "Success Verification Email Request",
  [LogTypes.MAX_AMOUNT_OF_AUTHENTICATORS]: "Max Amount of Authenticators",
  [LogTypes.USER_LOGIN_BLOCK_RELEASED]: "User Login Block Released",
  [LogTypes.FAILED_UNIVERSAL_LOGOUT]: "Failed Universal Logout",
  [LogTypes.SUCCESSFUL_UNIVERSAL_LOGOUT]: "Successful Universal Logout",
  [LogTypes.WARNING_DURING_LOGIN]: "Warning During Login",
  [LogTypes.WARNING_SENDING_NOTIFICATION]: "Warning Sending Notification",
  [LogTypes.WARNING_USER_MANAGEMENT]: "Warning User Management",
};

// Category derived from the LogTypes key name, so adding a new SUCCESS_* /
// FAILED_* / WARNING_* code is automatically classified.
export const logTypeCategories: Record<string, LogCategory> = (() => {
  const result: Record<string, LogCategory> = {};
  for (const [name, code] of Object.entries(LogTypes)) {
    if (
      name.startsWith("SUCCESS_") ||
      name.startsWith("SUCCESSFUL_") ||
      name.startsWith("SUCCESSFULLY_") ||
      name.endsWith("_SUCCEEDED") ||
      name.endsWith("_COMPLETED")
    ) {
      result[code] = "success";
    } else if (
      name.startsWith("FAILED_") ||
      name.startsWith("ERROR_") ||
      name.startsWith("BREACHED_") ||
      name.startsWith("BLOCKED_") ||
      name === "MFA_AUTH_FAILED" ||
      name === "MFA_AUTH_REJECTED" ||
      name === "MFA_RECOVERY_FAILED" ||
      name === "MFA_ENROLLMENT_FAILED" ||
      name === "EMAIL_VERIFICATION_FAILED" ||
      name === "WEBAUTHN_CHALLENGE_FAILED" ||
      name === "WEBAUTHN_ENROLLMENT_FAILED" ||
      name === "PASSKEY_CHALLENGE_FAILED" ||
      name === "FLOWS_EXECUTION_FAILED" ||
      name === "FORMS_SUBMISSION_FAILED" ||
      name === "CIBA_EXCHANGE_FAILED" ||
      name === "CIBA_START_FAILED" ||
      name === "ACTIONS_EXECUTION_FAILED" ||
      name === "RICH_CONSENTS_ACCESS_ERROR" ||
      name === "USER_CANCELED_DEVICE_CONFIRMATION" ||
      name === "TOO_MANY_MFA_FAILURES" ||
      name === "MFA_RECOVERY_RATE_LIMIT_EXCEED" ||
      name === "API_LIMIT" ||
      name === "MAX_AMOUNT_OF_AUTHENTICATORS"
    ) {
      result[code] = "failure";
    } else if (
      name.startsWith("WARNING_") ||
      name === "API_LIMIT_WARNING" ||
      name === "DEPRECATION_NOTICE" ||
      name === "PRE_LOGIN_ASSESSMENT"
    ) {
      result[code] = "warning";
    } else if (
      name === "CODE_SENT" ||
      name === "CODE_LINK_SENT" ||
      name === "MFA_EMAIL_SENT" ||
      name === "MFA_SMS_SENT" ||
      name === "EMAIL_VERIFICATION_SENT" ||
      name === "PUSH_NOTIFICATION_SENT"
    ) {
      result[code] = "code_sent";
    } else if (
      name === "INFORMATION" ||
      name === "INFORMATION_FROM_SS_SSO_OPERATION" ||
      name === "MANAGEMENT_API_READ_OPERATION" ||
      name === "APPI" ||
      name === "ACLS_SUMMARY" ||
      name === "ORGANIZATION_MEMBER_ADDED"
    ) {
      result[code] = "info";
    } else {
      result[code] = "other";
    }
  }
  return result;
})();

export function getLogTypeDescription(type: string): string {
  return logTypeDescriptions[type] ?? type;
}

export function getLogTypeCategory(type: string): LogCategory {
  return logTypeCategories[type] ?? "other";
}

export const Auth0Client = z.object({
  name: z.string(),
  version: z.string(),
  env: z
    .object({
      node: z.string().optional(),
    })
    .optional(),
});

export const LocationInfo = z.object({
  country_code: z.string().length(2),
  city_name: z.string(),
  latitude: z.string(),
  longitude: z.string(),
  time_zone: z.string(),
  continent_code: z.string(),
});

export const logInsertSchema = z.object({
  type: LogType,
  date: z.string(),
  description: z.string().optional(),
  ip: z.string().optional(),
  user_agent: z.string().optional(),
  details: z.any().optional(), // Using z.any() as a placeholder for "details" type
  isMobile: z.boolean(),
  user_id: z.string().optional(),
  user_name: z.string().optional(),
  connection: z.string().optional(),
  connection_id: z.string().optional(),
  client_id: z.string().optional(),
  client_name: z.string().optional(),
  audience: z.string().optional(),
  scope: z.string().optional(),
  strategy: z.string().optional(),
  strategy_type: z.string().optional(),
  hostname: z.string().optional(),
  auth0_client: Auth0Client.optional(),
  log_id: z.string().optional(),
  location_info: LocationInfo.optional(),
});

export type LogInsert = z.infer<typeof logInsertSchema>;

export const logSchema = logInsertSchema.extend({
  log_id: z.string(),
});

export type Log = z.infer<typeof logSchema>;
