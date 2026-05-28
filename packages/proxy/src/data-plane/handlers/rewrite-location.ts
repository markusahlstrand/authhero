import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";

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
      // Mutate headers in place — Hono's `c.res = …` setter merges old
      // headers over new ones, which would clobber our rewrite.
      c.res.headers.set("location", updatedLocation);
    };
  },
});
