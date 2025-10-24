// Subset of LogTypes used in react-admin app
// Values match those defined in @authhero/adapter-interfaces
export const LogTypes = {
  SUCCESS_API_OPERATION: "sapi",
  SUCCESS_SILENT_AUTH: "ssa",
  FAILED_SILENT_AUTH: "fsa",
  SUCCESS_SIGNUP: "ss",
  FAILED_SIGNUP: "fs",
  SUCCESS_LOGIN: "s",
  FAILED_LOGIN_INCORRECT_PASSWORD: "fp",
  FAILED_LOGIN_INVALID_EMAIL_USERNAME: "fu",
  SUCCESS_LOGOUT: "slo",
  SUCCESS_CROSS_ORIGIN_AUTHENTICATION: "scoa",
  FAILED_CROSS_ORIGIN_AUTHENTICATION: "fcoa",
  CODE_LINK_SENT: "cls", // Updated to match the main schema
  FAILED_LOGIN: "f",
  SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN: "seacft",
  FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN: "feacft",
} as const;

export type LogTypes = (typeof LogTypes)[keyof typeof LogTypes];

