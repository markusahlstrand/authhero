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
  created_at: z.string(),
});
export type RolePermission = z.infer<typeof rolePermissionSchema>;

export const rolePermissionListSchema = z.array(rolePermissionSchema);
export type RolePermissionList = z.infer<typeof rolePermissionListSchema>;
