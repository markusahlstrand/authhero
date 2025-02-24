import { z } from "@hono/zod-openapi";
import { connectionSchema } from "./Connection";
import { applicationSchema } from "./Application";
import { tenantSchema } from "./Tenant";

const ClientSchema = z.object({
  ...applicationSchema.shape,
  tenant: tenantSchema,
  connections: z.array(connectionSchema),
});

export type Client = z.infer<typeof ClientSchema>;
