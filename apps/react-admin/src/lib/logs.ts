// why are we using vanilla JS linting? it doesn't understand this...
// AND typescript can much better stop unused vars in tsconfig
/* eslint-disable no-unused-vars */
export enum LogTypes {
  SUCCESS_API_OPERATION = "sapi",
  SUCCESS_SILENT_AUTH = "ssa",
  FAILED_SILENT_AUTH = "fsa",
  SUCCESS_SIGNUP = "ss",
  FAILED_SIGNUP = "fs",
  SUCCESS_LOGIN = "s",
  FAILED_LOGIN_INCORRECT_PASSWORD = "fp",
  FAILED_LOGIN_INVALID_EMAIL_USERNAME = "fu",
  SUCCESS_LOGOUT = "slo",
  SUCCESS_CROSS_ORIGIN_AUTHENTICATION = "scoa",
  FAILED_CROSS_ORIGIN_AUTHENTICATION = "fcoa",
  CODE_LINK_EMAIL_SENT = "cls",
  FAILED_LOGIN = "f",
  SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN = "seacft",
}
