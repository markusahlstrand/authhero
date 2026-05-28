import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";
import { mutateRequestHeaders } from "./util";

const optionsSchema = z.object({
  // Header read for the immediate client IP. Defaults to CF-Connecting-IP
  // which is authoritative when running on the Cloudflare edge.
  client_ip_header: z.string().default("cf-connecting-ip"),
  set_x_real_ip: z.boolean().default(true),
  set_x_original_url: z.boolean().default(true),
});

type Options = z.infer<typeof optionsSchema>;

export const forwardedHeadersHandler = defineHandler<Options>({
  type: "forwarded_headers",
  optionsSchema,
  build(options) {
    return async (c, next) => {
      const url = new URL(c.req.url);

      mutateRequestHeaders(c, (headers) => {
        headers.set("x-forwarded-host", url.host);
        headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

        if (options.set_x_original_url) {
          headers.set("x-original-url", c.req.url);
        }

        const cfIp = headers.get(options.client_ip_header);
        const incomingXff = headers.get("x-forwarded-for") ?? "";
        const xffParts = incomingXff
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const immediateClientIp =
          cfIp ?? xffParts[xffParts.length - 1] ?? "127.0.0.1";

        // Only append immediateClientIp when it differs from the last entry —
        // without this check, missing CF-Connecting-IP causes us to duplicate
        // the tail of an upstream-supplied X-Forwarded-For chain.
        const shouldAppend =
          xffParts.length === 0 ||
          xffParts[xffParts.length - 1] !== immediateClientIp;
        const newXff = xffParts.length
          ? shouldAppend
            ? `${xffParts.join(", ")}, ${immediateClientIp}`
            : xffParts.join(", ")
          : immediateClientIp;
        headers.set("x-forwarded-for", newXff);

        if (options.set_x_real_ip) {
          headers.set("x-real-ip", immediateClientIp);
        }
      });

      await next();
    };
  },
});
