import { z } from "@hono/zod-openapi";
import { connectionSchema } from "./Connection";
import { applicationSchema } from "./Application";
import { tenantSchema } from "./Tenant";

const ClientDomainSchema = z.object({
  domain: z.string(),
  dkim_private_key: z.string().optional(),
  dkim_public_key: z.string().optional(),
  email_api_key: z.string().optional(),
  email_service: z.string().optional(),
});

const ClientSchema = z.object({
  ...applicationSchema.shape,
  domains: z.array(ClientDomainSchema),
  tenant: tenantSchema,
  connections: z.array(connectionSchema),
});

export type Client = z.infer<typeof ClientSchema>;
