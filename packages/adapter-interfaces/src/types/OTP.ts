import { z } from "@hono/zod-openapi";
import { authParamsSchema } from "./AuthParams";

export const otpInsertSchema = z.object({
  id: z.string(),
  email: z.string(),
  code: z.string(),
  ip: z.string().optional(),
  send: z.enum(["code", "link"]),
  authParams: authParamsSchema,
  expires_at: z.string(),
  used_at: z.string().optional(),
  user_id: z.string().optional(),
});

export type OTPInsert = z.infer<typeof otpInsertSchema>;

export const otpSchema = z.object({
  created_at: z.string(),
  ...otpInsertSchema.shape,
});

export type OTP = z.infer<typeof otpSchema>;
