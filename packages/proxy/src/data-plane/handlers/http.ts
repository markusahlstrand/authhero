import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";
import { isTimeoutLike, withAbortTimeout } from "../timeout";
import { getProxyRequest } from "./util";

const HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

const DEFAULT_UPSTREAM_TIMEOUT_MS = 30_000;

const optionsSchema = z.object({
  upstream_url: z.string(),
  preserve_host: z.boolean().default(false),
  timeout_ms: z.number().int().positive().optional(),
});

type Options = z.infer<typeof optionsSchema>;

function combinePaths(base: string, request: string): string {
  if (base === "" || base === "/") return request;
  const trimmedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const trimmedReq = request.startsWith("/") ? request : `/${request}`;
  return `${trimmedBase}${trimmedReq}`;
}

function bodyAllowed(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

// Bodies at or below this size are read into memory and forwarded as a buffer
// rather than a stream. Sized to cover what an auth upstream actually receives
// — form posts, token requests, SAML assertions — while leaving real uploads
// streaming.
const MAX_BUFFERED_BODY_BYTES = 128 * 1024;

function declaredBodySize(req: Request): number | null {
  const header = req.headers.get("content-length");
  if (header === null) return null;
  const size = Number(header);
  return Number.isInteger(size) && size >= 0 ? size : null;
}

/**
 * Decide what to hand `fetch` as the upstream body.
 *
 * Forwarding `req.body` gives the runtime a stream it must keep pumping for as
 * long as the subrequest is in flight. An upstream that answers without ever
 * reading it — a 404 on a POST, a redirect, a cached response — leaves that
 * pump unfinished, and returning its response makes the runtime log
 * `Can't read from request stream after response has been sent.` against a
 * request that otherwise succeeded. Reading a small, length-delimited body up
 * front removes the dangling stream: by the time the subrequest is built there
 * is nothing left to pump.
 *
 * Bodies with no declared length (chunked) or larger than
 * `MAX_BUFFERED_BODY_BYTES` still stream — those are real uploads, where
 * holding the whole body in the isolate costs more than a stray log line.
 */
async function resolveUpstreamBody(
  req: Request,
  headers: Headers,
): Promise<BodyInit | undefined> {
  if (!bodyAllowed(req.method) || !req.body) return undefined;

  const declared = declaredBodySize(req);
  if (declared === null || declared > MAX_BUFFERED_BODY_BYTES) {
    return req.body;
  }

  const buffered = await req.arrayBuffer();
  // A client is free to declare a length it does not send. Restate the header
  // from what actually arrived so the upstream is never handed a body and a
  // content-length that disagree.
  headers.set("content-length", String(buffered.byteLength));
  return buffered;
}

export async function buildUpstreamRequest(
  options: Options,
  req: Request,
): Promise<{ target: URL; init: RequestInit }> {
  const inUrl = new URL(req.url);
  const target = new URL(options.upstream_url);

  target.pathname = combinePaths(target.pathname, inUrl.pathname);
  target.search = inUrl.search;

  const headers = new Headers(req.headers);
  for (const key of HOP_HEADERS) headers.delete(key);

  if (!options.preserve_host) {
    headers.set("host", target.host);
  }
  if (!headers.has("x-forwarded-host")) {
    headers.set("x-forwarded-host", inUrl.host);
  }
  if (!headers.has("x-forwarded-proto")) {
    headers.set("x-forwarded-proto", inUrl.protocol.replace(":", ""));
  }

  const body = await resolveUpstreamBody(req, headers);
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    body,
    redirect: "manual",
  };
  // Node/undici require `duplex: "half"` whenever a streamed request body is
  // forwarded to fetch; without it the call throws before the request is sent.
  if (body instanceof ReadableStream) {
    init.duplex = "half";
  }
  return { target, init };
}

export const httpHandler = defineHandler<Options>({
  type: "http",
  optionsSchema,
  build(options) {
    const timeoutMs = options.timeout_ms ?? DEFAULT_UPSTREAM_TIMEOUT_MS;
    return async (c) => {
      const req = getProxyRequest(c);
      const { target, init } = await buildUpstreamRequest(options, req);

      // Stash upstream context for downstream rewrite handlers run on the
      // response phase of earlier middleware in the chain. Use `hostname`
      // (no port) so `rewrite_cookies` can match it against the `Domain=`
      // attribute, which never includes a port.
      c.set("__proxy_upstream_host__" as never, target.hostname);
      c.set(
        "__proxy_upstream_origin__" as never,
        `${target.protocol}//${target.host}`,
      );

      try {
        return await withAbortTimeout(timeoutMs, (signal) =>
          fetch(target.toString(), { ...init, signal }),
        );
      } catch (err) {
        if (isTimeoutLike(err)) {
          return c.text("Upstream timeout", 504, {
            "x-authhero-proxy-error": "http_timeout",
          });
        }
        return c.text("Bad gateway", 502, {
          "x-authhero-proxy-error": "http_failed",
        });
      }
    };
  },
});
