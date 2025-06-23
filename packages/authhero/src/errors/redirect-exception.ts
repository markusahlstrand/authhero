import { RedirectStatusCode } from "hono/utils/http-status";

export class RedirectException extends Error {
  location: string;
  status: RedirectStatusCode;
  constructor(location: string, status: RedirectStatusCode = 302) {
    super(`Redirect to ${location}`);
    this.location = location;
    this.status = status;
  }
}
