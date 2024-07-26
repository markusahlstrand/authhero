import { z } from "@hono/zod-openapi";
import { authParamsSchema } from "./AuthParams";

export const loginInsertSchema = z
  .object({
    login_id: z.string().openapi({
      description: "This is is used as the state in the universal login",
    }),
    auth0Client: z.string().optional(),
    authParams: authParamsSchema,
    expires_at: z.string(),
    deleted_at: z.string(),
    ip: z.string().optional(),
  })
  .openapi({
    description: "This represents a login sesion",
  });

export type LoginInsert = z.infer<typeof loginInsertSchema>;

export const loginSchema = z.object({
  ...loginInsertSchema.shape,
  created_at: z.string(),
  updated_at: z.string(),
});

export type Login = z.infer<typeof loginSchema>;