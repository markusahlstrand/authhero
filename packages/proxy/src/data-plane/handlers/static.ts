import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";

const optionsSchema = z.object({
  status: z.number().int().default(200),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  json: z.unknown().optional(),
});

type Options = z.infer<typeof optionsSchema>;

export const staticHandler = defineHandler<Options>({
  type: "static",
  optionsSchema,
  build(options) {
    return async () => {
      const headers = new Headers(options.headers ?? {});
      let body: BodyInit | null = options.body ?? null;
      if (options.json !== undefined) {
        body = JSON.stringify(options.json);
        if (!headers.has("content-type")) {
          headers.set("content-type", "application/json; charset=utf-8");
        }
      }
      return new Response(body, { status: options.status, headers });
    };
  },
});
