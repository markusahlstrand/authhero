import { z } from "@hono/zod-openapi";

const ErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
});

const ValidationErrorSchema = z.object({
  message: z.string(),
});

const ValidationRecordSchema = z.object({
  emails: z.array(z.string()),
  http_body: z.string(),
  http_url: z.string(),
  txt_name: z.string(),
  txt_value: z.string(),
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
  bundle_method: z.string(),
  certificate_authority: z.string(),
  custom_certificate: z.string(),
  custom_csr_id: z.string(),
  custom_key: z.string(),
  expires_on: z.string(),
  hosts: z.array(z.string()),
  issuer: z.string(),
  method: z.string(),
  serial_number: z.string(),
  settings: SslSettingsSchema,
  signature: z.string(),
  type: z.string(),
  uploaded_on: z.string(),
  validation_errors: z.array(ValidationErrorSchema),
  validation_records: z.array(ValidationRecordSchema),
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

const ResultSchema = z.object({
  id: z.string(),
  ssl: SslSchema,
  custom_metadata: z.record(z.string()),
  custom_origin_server: z.string(),
  custom_origin_sni: z.string(),
  ownership_verification: OwnershipVerificationSchema,
  ownership_verification_http: OwnershipVerificationHttpSchema,
  status: z.string(),
  verification_errors: z.array(z.string()),
});

export const CustomDomainResponseSchema = z.object({
  errors: z.array(ErrorSchema),
  messages: z.array(ErrorSchema),
  success: z.boolean(),
  result: ResultSchema,
});

export type CustomDomainResponse = z.infer<typeof CustomDomainResponseSchema>;
