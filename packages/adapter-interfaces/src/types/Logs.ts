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
  FAILED_HOOK: "fh", // Custom AuthHero-specific
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
  SUCCESS_EXCHANGE_PASSWORD_FOR_ACCESS_TOKEN: "sepft",
  SUCCESS_EXCHANGE_PASSKEY_OOB_FOR_ACCESS_TOKEN: "sepkoobft",
  SUCCESS_EXCHANGE_PASSKEY_OTP_FOR_ACCESS_TOKEN: "sepkotpft",
  SUCCESS_EXCHANGE_PASSKEY_MFA_RECOVERY_FOR_ACCESS_TOKEN: "sepkrcft",
  SUCCESS_EXCHANGE_PASSWORD_MFA_RECOVERY_FOR_ACCESS_TOKEN: "sercft",
  SUCCESS_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN: "sertft",
  SUCCESSFULLY_ACCEPTED_USER_INVITE: "si",
  BREACHED_PASSWORD_ON_SIGNUP: "signup_pwd_leak",
  SUCCESS_LOGOUT: "slo",
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

export const Auth0Client = z.object({
  name: z.string(),
  version: z.string(),
  env: z
    .object({
      node: z.string().optional(),
    })
    .optional(),
});

export const logInsertSchema = z.object({
  type: LogType,
  date: z.string(),
  description: z.string().optional(),
  ip: z.string(),
  user_agent: z.string(),
  details: z.any().optional(), // Using z.any() as a placeholder for "details" type
  isMobile: z.boolean(),
  user_id: z.string().optional(),
  user_name: z.string().optional(),
  connection: z.string().optional(),
  connection_id: z.string().optional(),
  client_id: z.string().optional(),
  client_name: z.string().optional(),
  audience: z.string().optional(),
  scope: z.array(z.string()).optional(),
  strategy: z.string().optional(),
  strategy_type: z.string().optional(),
  hostname: z.string().optional(),
  auth0_client: Auth0Client.optional(),
  log_id: z.string().optional(),
});

export type LogInsert = z.infer<typeof logInsertSchema>;

export const logSchema = z.object({
  ...logInsertSchema.shape,
  log_id: z.string(),
});

export type Log = z.infer<typeof logSchema>;
