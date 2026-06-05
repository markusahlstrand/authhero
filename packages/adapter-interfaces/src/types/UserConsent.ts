import { z } from "@hono/zod-openapi";

export const userConsentInsertSchema = z.object({
  user_id: z.string().openapi({
    description: "The id of the user that granted the consent",
  }),
  client_id: z.string().openapi({
    description: "The id of the client the consent was granted to",
  }),
  scopes: z.array(z.string()).default([]).openapi({
    description: "The list of OAuth scopes the user has consented to",
  }),
});

export type UserConsentInsert = z.input<typeof userConsentInsertSchema>;

export const userConsentSchema = userConsentInsertSchema.extend({
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type UserConsent = z.infer<typeof userConsentSchema>;
