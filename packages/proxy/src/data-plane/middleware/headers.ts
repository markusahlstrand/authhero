import { MiddlewareConfig } from "../../types";

type HeadersConfig = Extract<MiddlewareConfig, { type: "headers" }>;

export function applyHeadersRequest(
  config: HeadersConfig,
  req: Request,
): Request {
  const headers = new Headers(req.headers);
  config.remove_request?.forEach((key) => headers.delete(key));
  if (config.request) {
    for (const [key, value] of Object.entries(config.request)) {
      headers.set(key, value);
    }
  }
  return new Request(req.url, {
    method: req.method,
    headers,
    body: req.body,
    redirect: "manual",
  });
}

export function applyHeadersResponse(
  config: HeadersConfig,
  res: Response,
): Response {
  const headers = new Headers(res.headers);
  config.remove_response?.forEach((key) => headers.delete(key));
  if (config.response) {
    for (const [key, value] of Object.entries(config.response)) {
      headers.set(key, value);
    }
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
