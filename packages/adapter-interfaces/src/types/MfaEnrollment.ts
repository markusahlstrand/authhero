import { z } from "@hono/zod-openapi";

export const mfaEnrollmentTypeSchema = z.enum([
  "phone",
  "totp",
  "email",
  "push",
  "webauthn",
]);

export type MfaEnrollmentType = z.infer<typeof mfaEnrollmentTypeSchema>;

const mfaEnrollmentBaseSchema = z.object({
  user_id: z.string(),
  type: mfaEnrollmentTypeSchema,
  phone_number: z.string().optional(),
  totp_secret: z.string().optional(),
  confirmed: z.boolean().default(false),
});

function refineMfaEnrollment(
  data: z.infer<typeof mfaEnrollmentBaseSchema>,
  ctx: z.RefinementCtx,
) {
  if (data.type === "phone" && !data.phone_number) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "phone_number is required when type is 'phone'",
      path: ["phone_number"],
    });
  }
  if (data.type === "totp" && !data.totp_secret) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "totp_secret is required when type is 'totp'",
      path: ["totp_secret"],
    });
  }
}

export const mfaEnrollmentInsertSchema =
  mfaEnrollmentBaseSchema.superRefine(refineMfaEnrollment);

export type MfaEnrollmentInsert = z.infer<typeof mfaEnrollmentInsertSchema>;

export const mfaEnrollmentSchema = z
  .object({
    ...mfaEnrollmentBaseSchema.shape,
    id: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .superRefine(refineMfaEnrollment);

export type MfaEnrollment = z.infer<typeof mfaEnrollmentSchema>;
