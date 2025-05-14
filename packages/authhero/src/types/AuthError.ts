import { HTTPException } from "hono/http-exception";
import { ContentfulStatusCode } from "hono/utils/http-status";

export type HttpExceptionCode =
  | "EMAIL_NOT_VERIFIED"
  | "INVALID_PASSWORD"
  | "USER_NOT_FOUND"
  | "TOO_MANY_FAILED_LOGINS";

export type HttpExceptionOptions = {
  code: HttpExceptionCode;
  res?: Response;
  message?: string;
  cause?: unknown;
};

export class AuthError extends HTTPException {
  private _code?: HttpExceptionCode;

  constructor(status?: ContentfulStatusCode, options?: HttpExceptionOptions) {
    super(status, options);
    this._code = options?.code;
  }

  public get code(): HttpExceptionCode | undefined {
    return this._code;
  }
}
