import { z } from "@hono/zod-openapi";

export const samlpAddon = z.object({
  audience: z.string().optional(),
  recipient: z.string().optional(),
  createUpnClaim: z.boolean().optional(),
  mapUnknownClaimsAsIs: z.boolean().optional(),
  passthroughClaimsWithNoMapping: z.boolean().optional(),
  mapIdentities: z.boolean().optional(),
  signatureAlgorithm: z.string().optional(),
  digestAlgorithm: z.string().optional(),
  issuer: z.string().optional(),
  destination: z.string().optional(),
  lifetimeInSeconds: z.number().optional(),
  signResponse: z.boolean().optional(),
  nameIdentifierFormat: z.string().optional(),
  nameIdentifierProbes: z.array(z.string()).optional(),
  authnContextClassRef: z.string().optional(),
  mappings: z.record(z.string()).optional(),
});

export const applicationInsertSchema = z.object({
  id: z.string(),
  name: z.string(),
  callbacks: z.array(z.string()).openapi({
    description:
      "Comma-separated list of URLs whitelisted to use as a callback to the client after authentication.",
  }),
  allowed_origins: z.array(z.string()).openapi({
    description:
      "Comma-separated list of URLs allowed to make requests from JavaScript to Auth0 API (typically used with CORS). By default, all your callback URLs will be allowed. This field allows you to enter other origins if necessary. You can also use wildcards at the subdomain level. Query strings and hash information are not taken into account when validating these URLs.",
  }),
  web_origins: z.array(z.string()).openapi({
    description:
      "Comma-separated list of allowed origins for use with Cross-Origin Authentication, Device Flow, and web message response mode.",
  }),
  allowed_logout_urls: z.array(z.string()).openapi({
    description:
      "Comma-separated list of URLs that are valid to redirect to after logout from Auth0. Wildcards are allowed for subdomains.",
  }),
  addons: z
    .object({
      samlp: samlpAddon.optional(),
    })
    .optional()
    .openapi({
      description:
        "Addons associated with the client. The key is the addon's package name and the value is an object with the configuration for the addon.",
    }),
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

export const applicationSchema = z.object({
  created_at: z.string().transform((val) => (val === null ? "" : val)),
  updated_at: z.string().transform((val) => (val === null ? "" : val)),
  ...applicationInsertSchema.shape,
});

export type Application = z.infer<typeof applicationSchema>;
