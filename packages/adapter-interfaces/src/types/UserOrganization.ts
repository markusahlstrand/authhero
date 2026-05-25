import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";

export const userOrganizationInsertSchema = z.object({
  user_id: z.string().openapi({
    description: "ID of the user",
  }),
  organization_id: z.string().openapi({
    description: "ID of the organization",
  }),
});

export type UserOrganizationInsert = z.infer<
  typeof userOrganizationInsertSchema
>;

export const userOrganizationSchema = userOrganizationInsertSchema.extend(baseEntitySchema.shape).extend({
  id: z.string()
});

export type UserOrganization = z.infer<typeof userOrganizationSchema>;
