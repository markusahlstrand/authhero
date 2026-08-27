import { z } from "@hono/zod-openapi";
import { PRESERVE_LOCATION_HEADER } from "@authhero/adapter-interfaces";
import { defineHandler } from "../registry";
import { ensureMutableResponseHeaders } from "./util";

const optionsSchema = z.object({
  upstream_origin: z.string().optional(),
});

type Options = z.infer<typeof optionsSchema>;

export const rewriteLocationHandler = defineHandler<Options>({
  type: "rewrite_location",
  optionsSchema,
  build(options) {
    return async (c, next) => {
      await next();

      // The authhero control plane marks its deliberate cross-host redirects
      // (the /authorize/resume hop back to the original authorization host)
      // with this header. Rewriting a marked Location onto the request host
      // would send the browser straight back into the same hop — an infinite
      // redirect loop — so honor the marker and strip it; it's internal
      // plumbing that shouldn't reach the browser.
      if (c.res.headers.has(PRESERVE_LOCATION_HEADER)) {
        ensureMutableResponseHeaders(c);
        c.res.headers.delete(PRESERVE_LOCATION_HEADER);
        return;
      }

      const status = c.res.status;
      if (status < 300 || status >= 400) return;

      const location = c.res.headers.get("location");
      if (!location) return;

      const upstreamOrigin =
        options.upstream_origin ??
        (c.get("__proxy_upstream_origin__" as never) as string | undefined);
      if (!upstreamOrigin) return;

      // Parse the Location URL and require an exact origin match — a plain
      // `startsWith` accepts sibling hosts (e.g. upstreamOrigin
      // "https://example.com" against "https://example.com.evil.com/...").
      let parsedLocation: URL;
      try {
        parsedLocation = new URL(location);
      } catch {
        return;
      }
      if (parsedLocation.origin !== upstreamOrigin) return;

      const requestUrl = new URL(c.req.url);
      const requestOrigin = `${requestUrl.protocol}//${requestUrl.host}`;
      const updatedLocation = `${requestOrigin}${parsedLocation.pathname}${parsedLocation.search}${parsedLocation.hash}`;
      ensureMutableResponseHeaders(c);
      c.res.headers.set("location", updatedLocation);
    };
  },
});
