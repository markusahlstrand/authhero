import { LogTypes } from "../../lib/logs";

export function LogType({ type: logType }: { type: LogTypes }) {
  switch (logType) {
    case LogTypes.SUCCESS_API_OPERATION:
      return "Success API Operation";
    case LogTypes.SUCCESS_SILENT_AUTH:
      return "Success Silent Auth";
    case LogTypes.FAILED_SILENT_AUTH:
      return "Failed Silent Auth";
    case LogTypes.SUCCESS_SIGNUP:
      return "Success Signup";
    case LogTypes.FAILED_SIGNUP:
      return "Failed Signup";
    case LogTypes.SUCCESS_LOGIN:
      return "Success Login";
    case LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD:
      return "Failed Login Incorrect Password";
    case LogTypes.FAILED_LOGIN_INVALID_EMAIL_USERNAME:
      return "Failed Login Invalid Email Username";
    case LogTypes.SUCCESS_LOGOUT:
      return "Success Logout";
    case LogTypes.SUCCESS_CROSS_ORIGIN_AUTHENTICATION:
      return "Success Cross Origin Authentication";
    case LogTypes.FAILED_CROSS_ORIGIN_AUTHENTICATION:
      return "Failed Cross Origin Authentication";
    case LogTypes.CODE_LINK_SENT:
      return "Code Link Email Sent";
    case LogTypes.FAILED_LOGIN:
      return "Failed Login";
    case LogTypes.SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN:
      return "Success Exchange Authorization Code for Access Token";
    default:
      return `${logType}`;
  }
}
