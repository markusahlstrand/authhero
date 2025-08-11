import { z } from "@hono/zod-openapi";

export const tenantInsertSchema = z.object({
  name: z.string(),
  audience: z.string(),
  sender_email: z.string().email(),
  sender_name: z.string(),
  support_url: z.string().url().optional(),
  logo: z.string().url().optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
  language: z.string().optional(),
  id: z.string().optional(),
});

export const tenantSchema = z.object({
  created_at: z.string().transform((val) => (val === null ? "" : val)),
  updated_at: z.string().transform((val) => (val === null ? "" : val)),
  ...tenantInsertSchema.shape,
  id: z.string(),
});

export type Tenant = z.infer<typeof tenantSchema>;
