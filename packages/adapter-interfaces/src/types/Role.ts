import { z } from "@hono/zod-openapi";

// Role schema based on Auth0 Management API v2 roles
export const roleInsertSchema = z.object({
  id: z.string().optional().openapi({
    description:
      "The unique identifier of the role. If not provided, one will be generated.",
  }),
  name: z.string().min(1).max(50).openapi({
    description: "The name of the role. Cannot include '<' or '>'",
  }),
  description: z.string().max(255).optional().openapi({
    description: "The description of the role",
  }),
  is_system: z.boolean().optional(),
});

// Extend the insert schema for the full Role type, making id required
export const roleSchema = roleInsertSchema.extend({
  id: z.string().openapi({
    description: "The unique identifier of the role",
  }),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Role = z.infer<typeof roleSchema>;
export type RoleInsert = z.infer<typeof roleInsertSchema>;

// Role list response schema
export const roleListSchema = z.array(roleSchema);
export type RoleList = z.infer<typeof roleListSchema>;
