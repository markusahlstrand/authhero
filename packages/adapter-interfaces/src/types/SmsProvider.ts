import { z } from "@hono/zod-openapi";

export const smsSendParamsSchema = z.object({
  to: z.string(),
  message: z.string(),
});

export type SmsSendParams = z.infer<typeof smsSendParamsSchema>;

export const smsProviderSchema = z.object({
  name: z.string(),
  options: z.object({}),
});

export type SmsProvider = z.infer<typeof smsProviderSchema>;
