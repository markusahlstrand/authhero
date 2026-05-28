import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";

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
        c.res.headers.set(
          "Cache-Control",
          `public, max-age=${options.ttl_seconds}`,
        );
      }
    };
  },
});
