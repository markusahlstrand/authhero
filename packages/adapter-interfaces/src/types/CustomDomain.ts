import { z } from "@hono/zod-openapi";

export const customDomainInsertSchema = z.object({
  domain: z.string(),
  custom_domain_id: z.string().optional(),
  type: z.enum(["auth0_managed_certs", "self_managed_certs"]),
  verification_method: z.enum(["txt"]).optional(),
  tls_policy: z.enum(["recommended"]).optional(),
  custom_client_ip_header: z
    .enum([
      "true-client-ip",
      "cf-connecting-ip",
      "x-forwarded-for",
      "x-azure-clientip",
      "null",
    ])
    .optional(),
  domain_metadata: z.record(z.string().max(255)).optional(),
});

export type CustomDomainInsert = z.infer<typeof customDomainInsertSchema>;

export const customDomainSchema = z.object({
  ...customDomainInsertSchema.shape,
  custom_domain_id: z.string(),
  primary: z.boolean(),
  status: z.enum(["disabled", "pending", "pending_verification", "ready"]),
  origin_domain_name: z.string().optional(),
  verification: z.object({}).optional(),
  tls_policy: z.string().optional(),
});

export default customDomainSchema;

export type CustomDomain = z.infer<typeof customDomainSchema>;
