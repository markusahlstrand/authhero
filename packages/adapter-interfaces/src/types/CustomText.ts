import { z } from "@hono/zod-openapi";

/**
 * Available prompt screens that can be customized
 * Based on Auth0's prompt customization options
 */
export const promptScreenSchema = z.enum([
  "login",
  "login-id",
  "login-password",
  "signup",
  "signup-id",
  "signup-password",
  "reset-password",
  "consent",
  "mfa",
  "mfa-push",
  "mfa-otp",
  "mfa-voice",
  "mfa-phone",
  "mfa-webauthn",
  "mfa-sms",
  "mfa-email",
  "mfa-recovery-code",
  "status",
  "device-flow",
  "email-verification",
  "email-otp-challenge",
  "organizations",
  "invitation",
  "common",
  "passkeys",
  "captcha",
  "custom-form",
]);

export type PromptScreen = z.infer<typeof promptScreenSchema>;

/**
 * Custom text for a specific prompt screen and language
 * The values are key-value pairs where the key is the text identifier
 * and the value is the custom text to display
 */
export const customTextSchema = z.record(z.string(), z.string()).openapi({
  type: "object",
  additionalProperties: { type: "string" },
});

export type CustomText = z.infer<typeof customTextSchema>;

/**
 * Custom text entry for storage
 */
export const customTextEntrySchema = z.object({
  prompt: promptScreenSchema,
  language: z.string(),
  custom_text: customTextSchema,
});

export type CustomTextEntry = z.infer<typeof customTextEntrySchema>;
