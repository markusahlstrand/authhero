import { z } from "@hono/zod-openapi";
import { defineHandler } from "../registry";

const optionsSchema = z.object({
  username: z.string(),
  password: z.string(),
  realm: z.string().optional(),
});

type Options = z.infer<typeof optionsSchema>;

function encodeCredentials(username: string, password: string): string {
  const raw = `${username}:${password}`;
  if (typeof btoa === "function") return btoa(raw);
  return Buffer.from(raw, "utf-8").toString("base64");
}

export const basicAuthHandler = defineHandler<Options>({
  type: "basic_auth",
  optionsSchema,
  build(options) {
    const expected = encodeCredentials(options.username, options.password);
    const realm = (options.realm ?? "Restricted").replace(/["\\\r\n]/g, "");

    return async (c, next) => {
      const header = c.req.header("authorization");
      if (header) {
        const spaceIdx = header.indexOf(" ");
        if (spaceIdx > 0) {
          const scheme = header.slice(0, spaceIdx);
          const creds = header.slice(spaceIdx + 1);
          if (scheme.toLowerCase() === "basic" && creds === expected) {
            return next();
          }
        }
      }
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": `Basic realm="${realm}"` },
      });
    };
  },
});
