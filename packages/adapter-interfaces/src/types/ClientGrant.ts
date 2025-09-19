import { z } from "@hono/zod-openapi";

export const clientGrantInsertSchema = z.object({
  client_id: z.string().min(1).openapi({
    description: "ID of the client.",
  }),
  audience: z.string().min(1).openapi({
    description: "The audience (API identifier) of this client grant.",
  }),
  scope: z.array(z.string()).optional().openapi({
    description: "Scopes allowed for this client grant.",
  }),
  organization_usage: z
    .enum(["deny", "allow", "require"])
    .optional()
    .openapi({
      description:
        "Defines whether organizations can be used with client credentials exchanges for this grant.",
    }),
  allow_any_organization: z.boolean().optional().openapi({
    description:
      "If enabled, any organization can be used with this grant. If disabled (default), the grant must be explicitly assigned to the desired organizations.",
  }),
  is_system: z.boolean().optional().openapi({
    description:
      "If enabled, this grant is a special grant created by Auth0. It cannot be modified or deleted directly.",
  }),
  subject_type: z.enum(["client", "user"]).optional().openapi({
    description:
      "The type of application access the client grant allows. Use of this field is subject to the applicable Free Trial terms in Okta's Master Subscription Agreement.",
  }),
  authorization_details_types: z.array(z.string()).optional().openapi({
    description:
      "Types of authorization_details allowed for this client grant. Use of this field is subject to the applicable Free Trial terms in Okta's Master Subscription Agreement.",
  }),
});
export type ClientGrantInsert = z.input<typeof clientGrantInsertSchema>;

export const clientGrantSchema = z.object({
  id: z.string().openapi({
    description: "ID of the client grant.",
  }),
  ...clientGrantInsertSchema.shape,
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type ClientGrant = z.infer<typeof clientGrantSchema>;

export const clientGrantListSchema = z.array(clientGrantSchema);
export type ClientGrantList = z.infer<typeof clientGrantListSchema>;
