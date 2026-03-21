import { z } from "@hono/zod-openapi";

export const mfaEnrollmentTypeSchema = z.enum([
  "phone",
  "totp",
  "email",
  "push",
  "webauthn",
]);

export type MfaEnrollmentType = z.infer<typeof mfaEnrollmentTypeSchema>;

export const mfaEnrollmentInsertSchema = z.object({
  user_id: z.string(),
  type: mfaEnrollmentTypeSchema,
  phone_number: z.string().optional(),
  totp_secret: z.string().optional(),
  confirmed: z.boolean().default(false),
});

export type MfaEnrollmentInsert = z.infer<typeof mfaEnrollmentInsertSchema>;

export const mfaEnrollmentSchema = z.object({
  ...mfaEnrollmentInsertSchema.shape,
  id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type MfaEnrollment = z.infer<typeof mfaEnrollmentSchema>;
