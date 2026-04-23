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
    case LogTypes.FAILED_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN:
      return "Failed Exchange Authorization Code for Access Token";
    case LogTypes.SUCCESS_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN:
      return "Success Exchange Refresh Token for Access Token";
    case LogTypes.FAILED_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN:
      return "Failed Exchange Refresh Token for Access Token";
    case LogTypes.FAILED_EXCHANGE_ROTATING_REFRESH_TOKEN:
      return "Failed Exchange Rotating Refresh Token";
    case LogTypes.SUCCESS_EXCHANGE_PASSWORD_FOR_ACCESS_TOKEN:
      return "Success Exchange Password for Access Token";
    case LogTypes.FAILED_EXCHANGE_PASSWORD_FOR_ACCESS_TOKEN:
      return "Failed Exchange Password for Access Token";
    case LogTypes.SUCCESS_REVOCATION:
      return "Success Revocation";
    case LogTypes.CODE_SENT:
      return "Code Sent";
    case LogTypes.FAILED_API_OPERATION:
      return "Failed API Operation";
    case LogTypes.SUCCESS_CHANGE_EMAIL:
      return "Success Change Email";
    case LogTypes.FAILED_CHANGE_EMAIL:
      return "Failed Change Email";
    case LogTypes.SUCCESS_CHANGE_PASSWORD:
      return "Success Change Password";
    case LogTypes.FAILED_CHANGE_PASSWORD:
      return "Failed Change Password";
    case LogTypes.SUCCESS_CHANGE_PASSWORD_REQUEST:
      return "Success Change Password Request";
    case LogTypes.FAILED_CHANGE_PASSWORD_REQUEST:
      return "Failed Change Password Request";
    case LogTypes.SUCCESS_VERIFICATION_EMAIL:
      return "Success Verification Email";
    case LogTypes.FAILED_VERIFICATION_EMAIL:
      return "Failed Verification Email";
    case LogTypes.SUCCESS_VERIFICATION_EMAIL_REQUEST:
      return "Success Verification Email Request";
    case LogTypes.FAILED_VERIFICATION_EMAIL_REQUEST:
      return "Failed Verification Email Request";
    case LogTypes.SUCCESS_USER_DELETION:
      return "Success User Deletion";
    case LogTypes.FAILED_USER_DELETION:
      return "Failed User Deletion";
    default:
      return `${logType}`;
  }
}
