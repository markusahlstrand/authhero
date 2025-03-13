import { LogTypes } from "../../lib/logs";
import DoneIcon from "@mui/icons-material/Done";
import CloseIcon from "@mui/icons-material/Close";
import EmailIcon from "@mui/icons-material/Email";
import ErrorIcon from "@mui/icons-material/Error";
import QuestionMarkIcon from "@mui/icons-material/QuestionMark";

export function LogIcon({ type: logType }: { type: LogTypes }) {
  switch (logType) {
    case LogTypes.SUCCESS_API_OPERATION:
    case LogTypes.SUCCESS_SILENT_AUTH:
    case LogTypes.SUCCESS_SIGNUP:
    case LogTypes.SUCCESS_LOGIN:
    case LogTypes.SUCCESS_LOGOUT:
    case LogTypes.SUCCESS_CROSS_ORIGIN_AUTHENTICATION:
    case LogTypes.SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN:
      return <DoneIcon />;
    case LogTypes.FAILED_SILENT_AUTH:
    case LogTypes.FAILED_SIGNUP:
    case LogTypes.FAILED_LOGIN_INCORRECT_PASSWORD:
    case LogTypes.FAILED_LOGIN_INVALID_EMAIL_USERNAME:
    case LogTypes.FAILED_CROSS_ORIGIN_AUTHENTICATION:
      return <CloseIcon />;
    case LogTypes.CODE_LINK_EMAIL_SENT:
      return <EmailIcon />;
    case LogTypes.FAILED_LOGIN:
      return <ErrorIcon />;
    default:
      return <QuestionMarkIcon />;
  }
}
