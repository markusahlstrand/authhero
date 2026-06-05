import { z } from "@hono/zod-openapi";

export const grantInsertSchema = z.object({
  user_id: z.string().openapi({
    description: "The id of the user that granted the consent",
  }),
  clientID: z.string().openapi({
    description: "The id of the client the grant was issued to",
  }),
  audience: z.string().optional().openapi({
    description: "The audience the grant applies to",
  }),
  scope: z.array(z.string()).default([]).openapi({
    description: "The list of OAuth scopes the user has consented to",
  }),
});

export type GrantInsert = z.input<typeof grantInsertSchema>;

export const grantSchema = grantInsertSchema.extend({
  id: z.string(),
});

export type Grant = z.infer<typeof grantSchema>;
