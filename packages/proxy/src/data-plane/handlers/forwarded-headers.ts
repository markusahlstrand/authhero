import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";
import { isCloudflareIp } from "../cloudflare-ips";
import { mutateRequestHeaders } from "./util";

const optionsSchema = z.object({
  // Header read for the immediate client IP. Defaults to CF-Connecting-IP
  // which is authoritative when running on the Cloudflare edge.
  client_ip_header: z.string().default("cf-connecting-ip"),
  set_x_real_ip: z.boolean().default(true),
  set_x_original_url: z.boolean().default(true),
  // Ignore a client-IP header whose value is one of Cloudflare's own
  // addresses. Set false to restore the pre-hardening behavior (stamp
  // whatever the header carries).
  skip_cloudflare_client_ip: z.boolean().default(true),
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

        const rawClientIp = headers.get(options.client_ip_header);
        // When the proxy is itself reached worker-to-worker, CF-Connecting-IP
        // holds Cloudflare's loopback source rather than the visitor. Stamping
        // that would overwrite a real client IP the chain already carries (and
        // geolocate every visitor to wherever the loopback address resolves),
        // so treat it exactly like a missing header: fall back to the inbound
        // X-Forwarded-For chain. We deliberately do NOT fall back to an
        // inbound X-Real-IP — that value is client-spoofable.
        const cfIp =
          rawClientIp &&
          options.skip_cloudflare_client_ip &&
          isCloudflareIp(rawClientIp)
            ? null
            : rawClientIp;
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
