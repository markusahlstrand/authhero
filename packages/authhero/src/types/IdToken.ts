import { z } from "@hono/zod-openapi";

export const idTokenSchema = z
  .object({
    iss: z.string().url(),
    sub: z.string(),
    aud: z.string(),
    exp: z.number(),
    email: z.string().optional(),
    given_name: z.string().optional(),
    family_name: z.string().optional(),
    name: z.string().optional(),
    iat: z.number(), // Issued at
    auth_time: z.number().optional(), // Authentication time
    nonce: z.string().optional(), // Nonce
    acr: z.string().optional(), // Authentication Context Class Reference
    amr: z.array(z.string()).optional(), // Authentication Methods References
    azp: z.string().optional(), // Authorized party
    at_hash: z.string().optional(), // Access Token hash
    c_hash: z.string().optional(), // Code hash
  })
  .passthrough();

export type IdToken = z.infer<typeof idTokenSchema>;
