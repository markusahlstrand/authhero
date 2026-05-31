import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";
import { ensureMutableResponseHeaders } from "./util";

const optionsSchema = z.object({
  // Hostname on the upstream whose Domain= attribute should be rewritten.
  // If omitted, the handler infers it from the previously dispatched request
  // (stashed in the context).
  upstream_host: z.string().optional(),
});

type Options = z.infer<typeof optionsSchema>;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectSetCookies(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const out: string[] = [];
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") out.push(value);
  });
  return out;
}

export const rewriteCookiesHandler = defineHandler<Options>({
  type: "rewrite_cookies",
  optionsSchema,
  build(options) {
    return async (c, next) => {
      await next();
      const requestHost = new URL(c.req.url).hostname;
      const upstreamHost =
        options.upstream_host ??
        (c.get("__proxy_upstream_host__" as never) as string | undefined);
      if (!upstreamHost) return;

      const setCookies = collectSetCookies(c.res.headers);
      if (setCookies.length === 0) return;

      const escaped = escapeRegex(upstreamHost);
      const domainRegex = new RegExp(
        `(?:^|;\\s*)Domain=\\.?${escaped}(?=;|$)`,
        "i",
      );

      ensureMutableResponseHeaders(c);
      c.res.headers.delete("set-cookie");
      for (const cookie of setCookies) {
        c.res.headers.append(
          "set-cookie",
          cookie.replace(domainRegex, `Domain=${requestHost}`),
        );
      }
    };
  },
});
