import { z } from "@hono/zod-openapi";

// User role assignment
export const userRoleInsertSchema = z.object({
  user_id: z.string(),
  role_id: z.string(),
  organization_id: z.string().optional(),
});
export type UserRoleInsert = z.infer<typeof userRoleInsertSchema>;

export const userRoleSchema = z.object({
  ...userRoleInsertSchema.shape,
  tenant_id: z.string(),
  created_at: z.string().optional(),
});
export type UserRole = z.infer<typeof userRoleSchema>;

export const userRoleListSchema = z.array(userRoleSchema);
export type UserRoleList = z.infer<typeof userRoleListSchema>;
