import { z } from "@hono/zod-openapi";

// Mirrors Auth0's POST /api/v2/organizations/{id}/enabled_connections payload.
// `connection_id` is required on create; the boolean flags default per Auth0.
export const organizationConnectionInsertSchema = z.object({
  connection_id: z.string().openapi({
    description: "ID of the tenant-level connection to enable for the org.",
  }),
  assign_membership_on_login: z.boolean().optional().default(false),
  show_as_button: z.boolean().optional().default(true),
  is_signup_enabled: z.boolean().optional().default(true),
});
export type OrganizationConnectionInsert = z.input<
  typeof organizationConnectionInsertSchema
>;

export const organizationConnectionSchema = organizationConnectionInsertSchema.extend({
  // Auth0 includes the embedded connection in GET responses.
  connection: z
    .object({
      name: z.string().optional(),
      strategy: z.string().optional(),
    })
    .optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional()
});
export type OrganizationConnection = z.infer<
  typeof organizationConnectionSchema
>;

export const organizationConnectionListSchema = z.array(
  organizationConnectionSchema,
);
export type OrganizationConnectionList = z.infer<
  typeof organizationConnectionListSchema
>;
