import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";

const optionsSchema = z.object({
  upstream_url: z.string().refine(
    (val) => {
      try {
        const u = new URL(val);
        return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
      } catch {
        return false;
      }
    },
    { message: "upstream_url must be a valid http(s) URL with a hostname" },
  ),
  status: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
    .default(302),
  preserve_path: z.boolean().default(true),
  preserve_query: z.boolean().default(true),
});

type Options = z.infer<typeof optionsSchema>;

export const redirectHandler = defineHandler<Options>({
  type: "redirect",
  optionsSchema,
  build(options) {
    return async (c) => {
      const inUrl = new URL(c.req.url);
      const target = new URL(options.upstream_url);

      const targetHasPath = target.pathname && target.pathname !== "/";
      if (options.preserve_path && !targetHasPath) {
        target.pathname = inUrl.pathname;
      }
      if (options.preserve_query && !target.search) {
        target.search = inUrl.search;
      }

      return new Response(null, {
        status: options.status,
        headers: { location: target.toString() },
      });
    };
  },
});
