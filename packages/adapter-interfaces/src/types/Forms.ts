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
 * Schema for forms (flow-based, matches new JSON structure)
 */
export const formInsertSchema = z
  .object({
    name: z.string().openapi({
      description: "The name of the form",
    }),
    messages: z
      .object({
        errors: z.record(z.string(), z.any()).optional(),
        custom: z.record(z.string(), z.any()).optional(),
      })
      .optional(),
    languages: z
      .object({
        primary: z.string().optional(),
        default: z.string().optional(),
      })
      .optional(),
    translations: z.record(z.string(), z.any()).optional(),
    nodes: z
      .array(
        z.object({
          id: z.string(),
          type: z.string(),
          coordinates: z.object({ x: z.number(), y: z.number() }),
          alias: z.string(),
          config: z.record(z.string(), z.any()), // Accepts any config shape
        }),
      )
      .optional(),
    start: z
      .object({
        hidden_fields: z
          .array(z.object({ key: z.string(), value: z.string() }))
          .optional(),
        next_node: z.array(z.string()).optional(),
        coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
      })
      .optional(),
    ending: z
      .object({
        redirection: z
          .object({
            delay: z.number().optional(),
            target: z.string().optional(),
          })
          .optional(),
        after_submit: z.object({ flow_id: z.string().optional() }).optional(),
        coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
        resume_flow: z.boolean().optional(),
      })
      .optional(),
    style: z.object({ css: z.string().optional() }).optional(),
  })
  .openapi({
    description: "Schema for flow-based forms (matches new JSON structure)",
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
