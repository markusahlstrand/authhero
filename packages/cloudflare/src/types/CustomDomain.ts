import { z } from "@hono/zod-openapi";

const ErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
});

const ValidationErrorSchema = z.object({
  message: z.string(),
});

const ValidationRecordSchema = z.object({
  emails: z.array(z.string()).optional(),
  http_body: z.string(),
  http_url: z.string(),
  txt_name: z.string().optional(),
  txt_value: z.string().optional(),
});

const SslSettingsSchema = z.object({
  ciphers: z.array(z.string()),
  early_hints: z.string(),
  http2: z.string(),
  min_tls_version: z.string(),
  tls_1_3: z.string(),
});

const SslSchema = z.object({
  id: z.string(),
  bundle_method: z.string().optional(),
  certificate_authority: z.string(),
  custom_certificate: z.string().optional(),
  custom_csr_id: z.string().optional(),
  custom_key: z.string().optional(),
  expires_on: z.string().optional(),
  hosts: z.array(z.string()).optional(),
  issuer: z.string().optional(),
  method: z.string(),
  serial_number: z.string().optional(),
  settings: SslSettingsSchema.optional(),
  signature: z.string().optional(),
  type: z.string(),
  uploaded_on: z.string().optional(),
  validation_errors: z.array(ValidationErrorSchema).optional(),
  validation_records: z.array(ValidationRecordSchema).optional(),
  wildcard: z.boolean(),
});

const OwnershipVerificationSchema = z.object({
  name: z.string(),
  type: z.string(),
  value: z.string(),
});

const OwnershipVerificationHttpSchema = z.object({
  http_body: z.string(),
  http_url: z.string(),
});

const resultSchema = z.object({
  id: z.string(),
  ssl: SslSchema,
  hostname: z.string(),
  custom_metadata: z.record(z.string()).optional(),
  custom_origin_server: z.string().optional(),
  custom_origin_sni: z.string().optional(),
  ownership_verification: OwnershipVerificationSchema,
  ownership_verification_http: OwnershipVerificationHttpSchema,
  status: z.string(),
  verification_errors: z.array(z.string()).optional(),
  created_at: z.string(),
});

export type CustomDomainResult = z.infer<typeof resultSchema>;

export const customDomainResponseSchema = z.object({
  errors: z.array(ErrorSchema),
  messages: z.array(ErrorSchema),
  success: z.boolean(),
  result: resultSchema,
});

export const customDomainListResponseSchema = z.object({
  errors: z.array(ErrorSchema),
  messages: z.array(ErrorSchema),
  success: z.boolean(),
  result: z.array(resultSchema),
});

export type CustomDomainResponse = z.infer<typeof customDomainResponseSchema>;
