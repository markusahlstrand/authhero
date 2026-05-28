import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";
import { buildUpstreamRequest } from "./http";
import { getProxyRequest } from "./util";

const optionsSchema = z.object({
  // Name of the Cloudflare service binding to look up under `bindings`.
  binding: z.string(),
  // Optional URL to construct the target (origin is irrelevant for service
  // bindings but Cloudflare's fetcher API still requires a URL). Defaults to
  // an https URL with the binding name as the host.
  upstream_url: z.string().optional(),
  preserve_host: z.boolean().default(true),
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

    return async (c) => {
      const req = getProxyRequest(c);
      const { target, init } = buildUpstreamRequest(
        { upstream_url: upstreamUrl, preserve_host: options.preserve_host },
        req,
      );

      c.set("__proxy_upstream_host__" as never, target.host);
      c.set(
        "__proxy_upstream_origin__" as never,
        `${target.protocol}//${target.host}`,
      );

      return fetcher.fetch(new Request(target.toString(), init));
    };
  },
});
