import { z } from "@hono/zod-openapi";

// User permission assignment
export const userPermissionInsertSchema = z.object({
  user_id: z.string(),
  resource_server_identifier: z.string(),
  permission_name: z.string(),
});
export type UserPermissionInsert = z.infer<typeof userPermissionInsertSchema>;

export const userPermissionSchema = z.object({
  ...userPermissionInsertSchema.shape,
  tenant_id: z.string(),
  created_at: z.string().optional(),
});
export type UserPermission = z.infer<typeof userPermissionSchema>;

export const userPermissionListSchema = z.array(userPermissionSchema);
export type UserPermissionList = z.infer<typeof userPermissionListSchema>;

// For API responses - includes permission details
export const userPermissionWithDetailsSchema = z.object({
  user_id: z.string(),
  resource_server_identifier: z.string(),
  resource_server_name: z.string(),
  permission_name: z.string(),
  description: z.string().nullable().optional(),
  created_at: z.string().optional(),
});
export type UserPermissionWithDetails = z.infer<
  typeof userPermissionWithDetailsSchema
>;

export const userPermissionWithDetailsListSchema = z.array(
  userPermissionWithDetailsSchema,
);
export type UserPermissionWithDetailsList = z.infer<
  typeof userPermissionWithDetailsListSchema
>;
