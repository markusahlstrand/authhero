import { z } from "@hono/zod-openapi";

export enum LogTypes {
  FAILED_SILENT_AUTH = "fsa",
  FAILED_SIGNUP = "fs",
  FAILED_LOGIN = "f",
  FAILED_LOGIN_INCORRECT_PASSWORD = "fp",
  FAILED_CHANGE_PASSWORD = "fcp",
  FAILED_BY_CONNECTOR = "fc",
  FAILED_LOGIN_INVALID_EMAIL_USERNAME = "fu",
  // This is not available in auth0
  FAILED_HOOK = "fh",
  FAILED_CROSS_ORIGIN_AUTHENTICATION = "fcoa",

  SUCCESS_API_OPERATION = "sapi",
  SUCCESS_CHANGE_PASSWORD = "scp",
  SUCCESS_CHANGE_PASSWORD_REQUEST = "scpr",
  SUCCESS_CHANGE_USERNAME = "scu",
  SUCCESS_CROSS_ORIGIN_AUTHENTICATION = "scoa",
  SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN = "seacft",
  SUCCESS_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN = "serft",
  SUCCESS_LOGIN = "s",
  SUCCESS_LOGOUT = "slo",
  SUCCESS_SIGNUP = "ss",
  SUCCESS_SILENT_AUTH = "ssa",
  SUCCESS_VERIFICATION_EMAIL = "sv",
  SUCCESS_VERIFICATION_EMAIL_REQUEST = "svr",
  CODE_LINK_SENT = "cls",
}

// Enum for LogTypes
const LogType = z.enum([
  "cls", // CODE_LINK_SENT
  "fsa", // FAILED_SILENT_AUTH
  "fs", // FAILED_SIGNUP
  "f", // FAILED_LOGIN
  "fc", // FAILED_BY_CONNECTOR
  "fcoa", // FAILED_CROSS_ORIGIN_AUTHENTICATION
  "fcp", // FAILED_CHANGE_PASSWORD
  "fh", // FAILED_HOOK
  "fp", // FAILED_LOGIN_INCORRECT_PASSWORD
  "fs", // FAILED_SIGNUP
  "fu", // FAILED_LOGIN_INVALID_EMAIL_USERNAME
  "s", // SUCCESS_LOGIN
  "sapi", // SUCCESS_API_OPERATION
  "scoa", // SUCCESS_CROSS_ORIGIN_AUTHENTICATION
  "scp", // SUCCESS_CHANGE_PASSWORD
  "scpr", // SUCCESS_CHANGE_PASSWORD_REQUEST
  "scu", // SUCCESS_CHANGE_USERNAME
  "seacft", // SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN
  "serft", // SUCCESS_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN
  "slo", // SUCCESS_LOGOUT
  "ss", // SUCCESS_SIGNUP
  "ssa", // SUCCESS_SILENT_AUTH,
  "sv", // SUCCESS_VERIFICATION_EMAIL
  "svr", // SUCCESS_VERIFICATION_EMAIL_REQUEST
]);

export type LogType = z.infer<typeof LogType>;

export const Auth0Client = z.object({
  name: z.string(),
  version: z.string(),
  env: z
    .object({
      node: z.string().optional(),
    })
    .optional(),
});

export const logSchema = z.object({
  type: LogType,
  date: z.string(),
  description: z.string().optional(),
  log_id: z.string().optional(),
  _id: z.string().optional(),
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
});

export type Log = z.infer<typeof logSchema>;

export type LogsResponse = Log & {
  log_id: string;
  _id: string;
};
