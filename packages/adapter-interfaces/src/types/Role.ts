import { z } from "@hono/zod-openapi";

// Role schema based on Auth0 Management API v2 roles
export const roleInsertSchema = z.object({
  name: z.string().min(1).max(50).openapi({
    description: "The name of the role. Cannot include '<' or '>'",
  }),
  description: z.string().max(255).optional().openapi({
    description: "The description of the role",
  }),
  synced: z.boolean().optional(),
});

export const roleSchema = z.object({
  id: z.string().openapi({
    description: "The unique identifier of the role",
  }),
  ...roleInsertSchema.shape,
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Role = z.infer<typeof roleSchema>;
export type RoleInsert = z.infer<typeof roleInsertSchema>;

// Role list response schema
export const roleListSchema = z.array(roleSchema);
export type RoleList = z.infer<typeof roleListSchema>;
