import { z } from "@hono/zod-openapi";

export const jwksSchema = z
  .object({
    alg: z.enum([
      "RS256",
      "RS384",
      "RS512",
      "ES256",
      "ES384",
      "ES512",
      "HS256",
      "HS384",
      "HS512",
    ]),
    kid: z.string().optional(),
    kty: z.enum(["RSA", "EC", "oct"]),
    use: z.enum(["sig", "enc"]).optional(),
    // RSA-specific public-key members (RFC 7518 §6.3.1).
    n: z.string().optional(),
    e: z.string().optional(),
    // EC-specific public-key members (RFC 7518 §6.2.1).
    crv: z.string().optional(),
    x: z.string().optional(),
    y: z.string().optional(),
    x5t: z.string().optional(),
    x5c: z.array(z.string()).optional(),
  })
  .superRefine((jwk, ctx) => {
    if (jwk.kty === "RSA") {
      for (const field of ["n", "e"] as const) {
        if (!jwk[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `RSA JWK is missing required member '${field}'`,
          });
        }
      }
    } else if (jwk.kty === "EC") {
      for (const field of ["crv", "x", "y"] as const) {
        if (!jwk[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `EC JWK is missing required member '${field}'`,
          });
        }
      }
    }
  });

export const jwksKeySchema = z.object({
  keys: z.array(jwksSchema),
});

export type Jwk = z.infer<typeof jwksSchema>;
export type Jwks = z.infer<typeof jwksKeySchema>;

export const openIDConfigurationSchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  userinfo_endpoint: z.string(),
  jwks_uri: z.string(),
  registration_endpoint: z.string().optional(),
  revocation_endpoint: z.string(),
  end_session_endpoint: z.string().optional(),
  scopes_supported: z.array(z.string()),
  response_types_supported: z.array(z.string()),
  grant_types_supported: z.array(z.string()).optional(),
  code_challenge_methods_supported: z.array(z.string()),
  response_modes_supported: z.array(z.string()),
  subject_types_supported: z.array(z.string()),
  id_token_signing_alg_values_supported: z.array(z.string()),
  token_endpoint_auth_methods_supported: z.array(z.string()),
  claims_supported: z.array(z.string()),
  request_uri_parameter_supported: z.boolean(),
  request_parameter_supported: z.boolean(),
  claims_parameter_supported: z.boolean().optional(),
  request_object_signing_alg_values_supported: z.array(z.string()).optional(),
  token_endpoint_auth_signing_alg_values_supported: z.array(z.string()),
  client_id_metadata_document_supported: z.boolean().optional(),
  backchannel_logout_supported: z.boolean().optional(),
  backchannel_logout_session_supported: z.boolean().optional(),
});
