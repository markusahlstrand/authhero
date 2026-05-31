import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";
import { ensureMutableResponseHeaders } from "./util";

const optionsSchema = z.object({
  ttl_seconds: z.number().int().positive(),
});

type Options = z.infer<typeof optionsSchema>;

export const cacheHandler = defineHandler<Options>({
  type: "cache",
  optionsSchema,
  build(options) {
    return async (c, next) => {
      await next();
      if (!c.res.headers.has("Cache-Control")) {
        // Responses that set cookies are per-user and must not be cached by
        // shared caches; downgrade to `private` so the CDN/edge skips them.
        const visibility = c.res.headers.has("set-cookie")
          ? "private"
          : "public";
        ensureMutableResponseHeaders(c);
        c.res.headers.set(
          "Cache-Control",
          `${visibility}, max-age=${options.ttl_seconds}`,
        );
      }
    };
  },
});
