import { z } from "@hono/zod-openapi";
import { authParamsSchema } from "./AuthParams";

export const loginSessionInsertSchema = z
  .object({
    csrf_token: z.string(),
    auth0Client: z.string().optional(),
    authParams: authParamsSchema,
    expires_at: z.string(),
    deleted_at: z.string().optional(),
    ip: z.string().optional(),
    useragent: z.string().optional(),
    session_id: z.string().optional(),
    authorization_url: z.string().optional(),
    login_completed: z.boolean().optional().default(false),
  })
  .openapi({
    description: "This represents a login sesion",
  });

export type LoginSessionInsert = z.input<typeof loginSessionInsertSchema>;

export const loginSessionSchema = z.object({
  ...loginSessionInsertSchema.shape,
  id: z.string().openapi({
    description: "This is is used as the state in the universal login",
  }),
  created_at: z.string(),
  updated_at: z.string(),
});

export type LoginSession = z.infer<typeof loginSessionSchema>;
