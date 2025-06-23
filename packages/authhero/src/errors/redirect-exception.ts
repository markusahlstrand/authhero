import { RedirectStatusCode } from "hono/utils/http-status";

export class RedirectException extends Error {
  public readonly location: string;
  public readonly status: RedirectStatusCode;

  constructor(location: string, status: RedirectStatusCode = 302) {
    super(`Redirect to ${location}`);
    this.name = RedirectException.name;
    this.location = location;
    this.status = status;
  }
}
