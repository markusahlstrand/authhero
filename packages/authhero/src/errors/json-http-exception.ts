import { HTTPException } from "hono/http-exception";
import { ContentfulStatusCode } from "hono/utils/http-status";

export class JSONHTTPException extends HTTPException {
  constructor(status: ContentfulStatusCode, body: object) {
    super(status, {
      message: JSON.stringify(body),
      res: new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    });
  }
}
