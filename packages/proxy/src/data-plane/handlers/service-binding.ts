import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";
import { isTimeoutLike, withAbortTimeout } from "../timeout";
import { buildUpstreamRequest } from "./http";
import { getProxyRequest } from "./util";

const DEFAULT_TIMEOUT_MS = 30_000;

const optionsSchema = z.object({
  // Name of the Cloudflare service binding to look up under `bindings`.
  binding: z.string(),
  // Optional URL to construct the target (origin is irrelevant for service
  // bindings but Cloudflare's fetcher API still requires a URL). Defaults to
  // an https URL with the binding name as the host.
  upstream_url: z.string().optional(),
  preserve_host: z.boolean().default(true),
  // Per-route hard timeout (ms) on the binding fetch. Defaults to 30s — a
  // misconfigured or stuck binding otherwise hangs the parent worker until
  // the CF runtime kills it.
  timeout_ms: z.number().int().positive().optional(),
});

type Options = z.infer<typeof optionsSchema>;

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

function isFetcher(value: unknown): value is Fetcher {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { fetch?: unknown }).fetch === "function"
  );
}

export const serviceBindingHandler = defineHandler<Options>({
  type: "service_binding",
  optionsSchema,
  build(options, ctx) {
    const fetcher = ctx.bindings[options.binding];
    if (!isFetcher(fetcher)) {
      throw new Error(
        `Service binding "${options.binding}" is not configured or is not a Fetcher`,
      );
    }
    const upstreamUrl =
      options.upstream_url ?? `https://${options.binding}.binding.invalid/`;
    const timeoutMs = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;

    return async (c) => {
      const req = getProxyRequest(c);
      const { target, init } = buildUpstreamRequest(
        { upstream_url: upstreamUrl, preserve_host: options.preserve_host },
        req,
      );

      // `hostname` (no port) so `rewrite_cookies` can match against the
      // upstream cookie's `Domain=` attribute, which never carries a port.
      c.set("__proxy_upstream_host__" as never, target.hostname);
      c.set(
        "__proxy_upstream_origin__" as never,
        `${target.protocol}//${target.host}`,
      );

      try {
        return await withAbortTimeout(timeoutMs, async (signal) => {
          return fetcher.fetch(
            new Request(target.toString(), { ...init, signal }),
          );
        });
      } catch (err) {
        if (isTimeoutLike(err)) {
          return c.text(`service_binding timed out after ${timeoutMs}ms`, 504, {
            "x-authhero-proxy-error": "service_binding_timeout",
          });
        }
        return c.text("Bad gateway", 502, {
          "x-authhero-proxy-error": "service_binding_failed",
        });
      }
    };
  },
});
