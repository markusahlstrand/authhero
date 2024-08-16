import { z } from "@hono/zod-openapi";

export const applicationInsertSchema = z.object({
  id: z.string(),
  name: z.string(),
  callbacks: z
    .string()
    .transform((val) => (val === null ? "" : val))
    .default("")
    .openapi({
      description:
        "Comma-separated list of URLs whitelisted to use as a callback to the client after authentication.",
    }),
  allowed_origins: z
    .string()
    .transform((val) => (val === null ? "" : val))
    .default("")
    .openapi({
      description:
        "Comma-separated list of URLs allowed to make requests from JavaScript to Auth0 API (typically used with CORS). By default, all your callback URLs will be allowed. This field allows you to enter other origins if necessary. You can also use wildcards at the subdomain level. Query strings and hash information are not taken into account when validating these URLs.",
    }),
  web_origins: z
    .string()
    .transform((val) => (val === null ? "" : val))
    .default("")
    .openapi({
      description:
        "Comma-separated list of allowed origins for use with Cross-Origin Authentication, Device Flow, and web message response mode.",
    }),
  addons: z
    .record(z.string(), z.record(z.string(), z.union([z.string(), z.number()])))
    .optional()
    .openapi({
      description:
        "Addons associated with the client. The key is the addon's package name and the value is an object with the configuration for the addon.",
    }),
  // @deprecated. Renamed to match the auth0 API
  allowed_web_origins: z
    .string()
    .transform((val) => (val === null ? "" : val))
    .default(""),
  allowed_callback_urls: z
    .string()
    .transform((val) => (val === null ? "" : val))
    .default(""),
  allowed_logout_urls: z
    .string()
    .transform((val) => (val === null ? "" : val))
    .default(""),
  email_validation: z
    .enum(["enabled", "disabled", "enforced"])
    .default("enforced")
    .openapi({
      description:
        "Defines if it possible to sign in with an unverified email and if verification emails will be sent. This is not available in auth0",
    }),
  client_secret: z.string().default(""),
  disable_sign_ups: z.boolean().default(false).openapi({
    description:
      "Prevents users from signing up using the hosted login page. This is not available in auth0",
  }),
});
export type ApplicationInsert = z.infer<typeof applicationInsertSchema>;

export const applicationSchema = z
  .object({
    created_at: z.string().transform((val) => (val === null ? "" : val)),
    updated_at: z.string().transform((val) => (val === null ? "" : val)),
  })
  .extend(applicationInsertSchema.shape);

export type Application = z.infer<typeof applicationSchema>;
