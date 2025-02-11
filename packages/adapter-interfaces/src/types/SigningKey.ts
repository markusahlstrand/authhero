import { z } from "@hono/zod-openapi";

export const signingKeySchema = z.object({
  kid: z.string().openapi({ description: "The key id of the signing key" }),
  cert: z
    .string()
    .openapi({ description: "The public certificate of the signing key" }),
  fingerprint: z.string().openapi({ description: "The cert fingerprint" }),
  thumbprint: z.string().openapi({ description: "The cert thumbprint" }),
  pkcs7: z.string().optional().openapi({
    description: "The private key in pkcs7 format",
  }),
  current: z
    .boolean()
    .optional()
    .openapi({ description: "True if the key is the current key" }),
  next: z
    .boolean()
    .optional()
    .openapi({ description: "True if the key is the next key" }),
  previous: z
    .boolean()
    .optional()
    .openapi({ description: "True if the key is the previous key" }),
  current_since: z.string().optional().openapi({
    description: "The date and time when the key became the current key",
  }),
  current_until: z.string().optional().openapi({
    description: "The date and time when the current key was rotated",
  }),
  revoked: z
    .boolean()
    .optional()
    .openapi({ description: "True if the key is revoked" }),
  revoked_at: z
    .string()
    .optional()
    .openapi({ description: "The date and time when the key was revoked" }),
});

export type SigningKey = z.infer<typeof signingKeySchema>;
