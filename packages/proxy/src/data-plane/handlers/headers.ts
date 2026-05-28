import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";
import { mutateRequestHeaders } from "./util";

const optionsSchema = z.object({
  request: z.record(z.string(), z.string()).optional(),
  response: z.record(z.string(), z.string()).optional(),
  remove_request: z.array(z.string()).optional(),
  remove_response: z.array(z.string()).optional(),
});

type Options = z.infer<typeof optionsSchema>;

export const headersHandler = defineHandler<Options>({
  type: "headers",
  optionsSchema,
  build(options) {
    return async (c, next) => {
      if (options.request || options.remove_request) {
        mutateRequestHeaders(c, (headers) => {
          options.remove_request?.forEach((k) => headers.delete(k));
          if (options.request) {
            for (const [k, v] of Object.entries(options.request)) {
              headers.set(k, v);
            }
          }
        });
      }

      await next();

      if (options.response || options.remove_response) {
        options.remove_response?.forEach((k) => c.res.headers.delete(k));
        if (options.response) {
          for (const [k, v] of Object.entries(options.response)) {
            c.res.headers.set(k, v);
          }
        }
      }
    };
  },
});
