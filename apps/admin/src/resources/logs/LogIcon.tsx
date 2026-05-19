import { LogTypes } from "@/lib/logs";
import { Check, X, Mail, AlertCircle, Info, HelpCircle } from "lucide-react";

const SUCCESS_TYPES = new Set<string>([
  LogTypes.SUCCESS_API_OPERATION,
  LogTypes.SUCCESS_SILENT_AUTH,
  LogTypes.SUCCESS_SIGNUP,
  LogTypes.SUCCESS_LOGIN,
  LogTypes.SUCCESS_LOGOUT,
  LogTypes.SUCCESS_CROSS_ORIGIN_AUTHENTICATION,
  LogTypes.SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
  LogTypes.SUCCESS_EXCHANGE_ACCESS_TOKEN_FOR_CLIENT_CREDENTIALS,
  LogTypes.SUCCESS_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN,
  LogTypes.SUCCESS_EXCHANGE_PASSWORD_FOR_ACCESS_TOKEN,
  LogTypes.SUCCESS_EXCHANGE_PASSWORD_OTP_FOR_ACCESS_TOKEN,
  LogTypes.SUCCESS_REVOCATION,
  LogTypes.SUCCESS_CHANGE_EMAIL,
  LogTypes.SUCCESS_CHANGE_PASSWORD,
  LogTypes.SUCCESS_CHANGE_PASSWORD_REQUEST,
  LogTypes.SUCCESS_VERIFICATION_EMAIL,
  LogTypes.SUCCESS_VERIFICATION_EMAIL_REQUEST,
  LogTypes.SUCCESS_USER_DELETION,
  LogTypes.SUCCESS_PASSWORD_MIGRATION,
]);

const FAILED_TYPES = new Set<string>([
  LogTypes.FAILED_SILENT_AUTH,
  LogTypes.FAILED_SIGNUP,
  LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD,
  LogTypes.FAILED_LOGIN_INVALID_EMAIL_USERNAME,
  LogTypes.FAILED_CROSS_ORIGIN_AUTHENTICATION,
  LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN,
  LogTypes.FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN,
  LogTypes.FAILED_EXCHANGE_ROTATING_REFRESH_TOKEN,
  LogTypes.FAILED_EXCHANGE_PASSWORD_FOR_ACCESS_TOKEN,
  LogTypes.FAILED_API_OPERATION,
  LogTypes.FAILED_CHANGE_EMAIL,
  LogTypes.FAILED_CHANGE_PASSWORD,
  LogTypes.FAILED_CHANGE_PASSWORD_REQUEST,
  LogTypes.FAILED_VERIFICATION_EMAIL,
  LogTypes.FAILED_VERIFICATION_EMAIL_REQUEST,
  LogTypes.FAILED_USER_DELETION,
]);

export function LogIcon({ type }: { type: string }) {
  if (SUCCESS_TYPES.has(type)) return <Check className="h-4 w-4 text-green-600" />;
  if (FAILED_TYPES.has(type)) return <X className="h-4 w-4 text-red-600" />;
  if (type === LogTypes.CODE_LINK_SENT || type === LogTypes.CODE_SENT)
    return <Mail className="h-4 w-4 text-blue-600" />;
  if (type === LogTypes.FAILED_LOGIN)
    return <AlertCircle className="h-4 w-4 text-red-600" />;
  if (type === LogTypes.INFORMATION)
    return <Info className="h-4 w-4 text-blue-600" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
}
