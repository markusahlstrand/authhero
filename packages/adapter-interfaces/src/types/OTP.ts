import { z } from "@hono/zod-openapi";
import { authParamsSchema } from "./AuthParams";

export const otpSchema = z.object({
  id: z.string(),
  tenant_id: z.string(),
  client_id: z.string(),
  email: z.string(),
  code: z.string(),
  ip: z.string().optional(),
  send: z.string().optional(),
  authParams: authParamsSchema,
  created_at: z.string(),
  expires_at: z.string(),
  used_at: z.string().optional(),
  user_id: z.string().optional(),
});

export type OTP = z.infer<typeof otpSchema>;
