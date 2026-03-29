import { z } from "@hono/zod-openapi";

export const authenticationMethodTypeSchema = z.enum([
  "phone",
  "totp",
  "email",
  "push",
  "webauthn-roaming",
  "webauthn-platform",
  "passkey",
]);

export type AuthenticationMethodType = z.infer<
  typeof authenticationMethodTypeSchema
>;

const authenticationMethodBaseSchema = z.object({
  user_id: z.string(),
  type: authenticationMethodTypeSchema,
  // Phone-specific
  phone_number: z.string().optional(),
  // TOTP-specific
  totp_secret: z.string().optional(),
  // WebAuthn/Passkey-specific
  credential_id: z.string().optional(),
  public_key: z.string().optional(),
  sign_count: z.number().optional(),
  credential_backed_up: z.boolean().optional(),
  transports: z.array(z.string()).optional(),
  friendly_name: z.string().optional(),
  // Common
  confirmed: z.boolean().default(false),
});

function refineAuthenticationMethod(
  data: z.infer<typeof authenticationMethodBaseSchema>,
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
  const webauthnTypes = ["webauthn-roaming", "webauthn-platform", "passkey"];
  if (webauthnTypes.includes(data.type)) {
    if (!data.credential_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `credential_id is required when type is '${data.type}'`,
        path: ["credential_id"],
      });
    }
    if (!data.public_key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `public_key is required when type is '${data.type}'`,
        path: ["public_key"],
      });
    }
  }
}

export const authenticationMethodInsertSchema =
  authenticationMethodBaseSchema.superRefine(refineAuthenticationMethod);

export type AuthenticationMethodInsert = z.infer<
  typeof authenticationMethodInsertSchema
>;

export const authenticationMethodSchema = z
  .object({
    ...authenticationMethodBaseSchema.shape,
    id: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .superRefine(refineAuthenticationMethod);

export type AuthenticationMethod = z.infer<typeof authenticationMethodSchema>;
