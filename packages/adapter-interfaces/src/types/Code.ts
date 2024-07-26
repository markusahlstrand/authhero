import { z } from "@hono/zod-openapi";

export const codeTypeSchema = z.enum([
  "password_reset",
  "email_verification",
  "otp",
  "oauth2",
  "oauth2_state",
  "ticket",
]);
export type CodeType = z.infer<typeof codeTypeSchema>;

export const codeSchema = z.object({
  code_id: z.string().openapi({
    description:
      "The code that will be used in for instance an email verification flow",
  }),
  login_id: z.string().openapi({
    description: "The id of the login session that the code is connected to",
  }),
  code_type: codeTypeSchema,
  created_at: z.string(),
  expires_at: z.string(),
  used_at: z.string().optional(),
});

export type Code = z.infer<typeof codeSchema>;
