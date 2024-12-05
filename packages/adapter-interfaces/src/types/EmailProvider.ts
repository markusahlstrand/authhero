import { z } from "@hono/zod-openapi";

export const emailProviderSchema = z.object({
  name: z.string(),
  enabled: z.boolean().optional().default(true),
  default_from_address: z.string().optional(),
  credentials: z.union([
    z.object({
      accessKeyId: z.string(),
      secretAccessKey: z.string(),
      region: z.string(),
    }),
    z.object({
      smtp_host: z.array(z.string()),
      smtp_port: z.number(),
      smtp_user: z.string(),
      smtp_pass: z.string(),
    }),
    z.object({
      api_key: z.string(),
      domain: z.string().optional(),
    }),
    z.object({
      connectionString: z.string(),
    }),
    z.object({
      tenantId: z.string(),
      clientId: z.string(),
      clientSecret: z.string(),
    }),
  ]),
  settings: z.object({}).optional(),
});

export type EmailProvider = z.infer<typeof emailProviderSchema>;
