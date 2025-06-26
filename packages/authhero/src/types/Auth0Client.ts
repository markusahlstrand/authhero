import { z } from "@hono/zod-openapi";
// Zod schema for auth0Client JSON format
export const auth0ClientSchema = z.object({
  name: z.string(),
  version: z.string(),
  env: z
    .object({
      node: z.string().optional(),
    })
    .optional(),
});

export type Auth0Client = z.infer<typeof auth0ClientSchema>;
