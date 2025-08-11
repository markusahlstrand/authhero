import { z } from "@hono/zod-openapi";

// Source indicating how a permission was granted to the user (e.g., directly, via role)
export const permissionSourceSchema = z
  .object({
    source_id: z.string().optional(),
    source_name: z.string().optional(),
    // Auth0 commonly uses values like "DIRECT" and "ROLE"; allow any string for forward compatibility
    source_type: z.string().optional(),
  })
  .passthrough();
export type PermissionSource = z.infer<typeof permissionSourceSchema>;

// Permission item as returned by Auth0 user permissions endpoint
export const permissionSchema = z
  .object({
    permission_name: z.string(),
    description: z.string().nullable().optional(),
    resource_server_identifier: z.string(),
    resource_server_name: z.string(),
    sources: z.array(permissionSourceSchema).optional(),
  })
  .passthrough();
export type Permission = z.infer<typeof permissionSchema>;
export type PermissionInsert = z.input<typeof permissionSchema>;

export const permissionListSchema = z.array(permissionSchema);
export type PermissionList = z.infer<typeof permissionListSchema>;
