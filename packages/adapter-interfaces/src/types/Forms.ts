import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";

/**
 * Form field types supported by Auth0
 */
export enum FormFieldType {
  TEXT = "text",
  EMAIL = "email",
  PASSWORD = "password",
  NUMBER = "number",
  PHONE = "phone",
  DATE = "date",
  CHECKBOX = "checkbox",
  RADIO = "radio",
  SELECT = "select",
  HIDDEN = "hidden",
}

/**
 * Form field validation types
 */
export enum ValidationErrorType {
  REQUIRED = "required",
  FORMAT = "format",
  MIN_LENGTH = "min_length",
  MAX_LENGTH = "max_length",
  MIN = "min",
  MAX = "max",
  MATCHING_PATTERN = "matching_pattern",
}

/**
 * Validation schema for form fields
 */
export const formFieldValidationSchema = z.object({
  type: z.nativeEnum(ValidationErrorType),
  message: z.string(),
  // Additional validation properties
  min_length: z.number().optional(),
  max_length: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  format: z.string().optional(),
});

export type FormFieldValidation = z.infer<typeof formFieldValidationSchema>;

/**
 * Options for select, radio, and checkbox fields
 */
export const formFieldOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
  checked: z.boolean().optional(),
});

export type FormFieldOption = z.infer<typeof formFieldOptionSchema>;

/**
 * Schema for form fields
 */
export const formFieldSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.nativeEnum(FormFieldType),
  label: z.string(),
  placeholder: z.string().optional(),
  required: z.boolean().optional().default(false),
  disabled: z.boolean().optional().default(false),
  readOnly: z.boolean().optional().default(false),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  validations: z.array(formFieldValidationSchema).optional(),
  options: z.array(formFieldOptionSchema).optional(),
  description: z.string().optional(),
  order: z.number().optional(),
  visible: z.boolean().optional().default(true),
  customizations: z.record(z.string(), z.any()).optional(),
});

export type FormField = z.infer<typeof formFieldSchema>;

/**
 * Schema for form controls (like submit buttons)
 */
export const formControlSchema = z.object({
  id: z.string(),
  type: z.literal("submit"),
  label: z.string(),
  className: z.string().optional(),
  disabled: z.boolean().optional().default(false),
  order: z.number().optional(),
  visible: z.boolean().optional().default(true),
  customizations: z.record(z.string(), z.any()).optional(),
});

export type FormControl = z.infer<typeof formControlSchema>;

/**
 * Supported form types
 */
export enum FormType {
  LOGIN = "login",
  SIGNUP = "signup",
  RESET_PASSWORD = "reset-password",
  MFA = "mfa",
  MFA_ENROLLMENT = "mfa-enrollment",
  VERIFICATION_CODE = "verification-code",
  INVITATION = "invitation",
  CUSTOM = "custom",
}

/**
 * Schema for forms
 */
export const formInsertSchema = z.object({
  name: z.string().openapi({
    description: "The name of the form",
  }),
  type: z.nativeEnum(FormType).openapi({
    description: "The type of the form",
  }),
  client_id: z.string().optional().openapi({
    description: "The client ID the form is associated with",
  }),
  fields: z.array(formFieldSchema).openapi({
    description: "The fields in the form",
  }),
  controls: z.array(formControlSchema).optional().openapi({
    description: "The controls (like submit buttons) in the form",
  }),
  redirect_uri: z.string().optional().openapi({
    description: "The URI to redirect to after form submission",
  }),
  post_submit_action: z.enum(["redirect", "message"]).optional().openapi({
    description: "The action to take after form submission",
    example: "redirect",
  }),
  success_message: z.string().optional().openapi({
    description: "Message to display on successful form submission",
  }),
  language: z.string().optional().openapi({
    description: "The language code for the form",
    example: "en",
  }),
  active: z.boolean().default(true).openapi({
    description: "Whether the form is active or not",
  }),
  layout: z
    .object({
      columns: z.number().optional().default(1),
      template: z.string().optional(),
    })
    .optional()
    .openapi({
      description: "Layout settings for the form",
    }),
  css: z.string().optional().openapi({
    description: "Custom CSS for the form",
  }),
  javascript: z.string().optional().openapi({
    description: "Custom JavaScript for the form",
  }),
});

export type FormInsert = z.input<typeof formInsertSchema>;

/**
 * Schema for complete form with base entity properties
 */
export const formSchema = z.object({
  ...baseEntitySchema.shape,
  ...formInsertSchema.shape,
  id: z.string(),
});

export type Form = z.infer<typeof formSchema>;
