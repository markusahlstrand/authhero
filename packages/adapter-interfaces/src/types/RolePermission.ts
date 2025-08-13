import { z } from "@hono/zod-openapi";

// Role permission assignment
export const rolePermissionInsertSchema = z.object({
  role_id: z.string(),
  resource_server_identifier: z.string(),
  permission_name: z.string(),
});
export type RolePermissionInsert = z.infer<typeof rolePermissionInsertSchema>;

export const rolePermissionSchema = z.object({
  ...rolePermissionInsertSchema.shape,
  tenant_id: z.string(),
  created_at: z.string().optional(),
});
export type RolePermission = z.infer<typeof rolePermissionSchema>;

export const rolePermissionListSchema = z.array(rolePermissionSchema);
export type RolePermissionList = z.infer<typeof rolePermissionListSchema>;

// For API responses - includes permission details
export const rolePermissionWithDetailsSchema = z.object({
  role_id: z.string(),
  resource_server_identifier: z.string(),
  resource_server_name: z.string(),
  permission_name: z.string(),
  description: z.string().nullable().optional(),
  created_at: z.string().optional(),
});
export type RolePermissionWithDetails = z.infer<
  typeof rolePermissionWithDetailsSchema
>;

export const rolePermissionWithDetailsListSchema = z.array(
  rolePermissionWithDetailsSchema,
);
export type RolePermissionWithDetailsList = z.infer<
  typeof rolePermissionWithDetailsListSchema
>;
