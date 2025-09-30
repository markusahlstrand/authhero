import { z } from "@hono/zod-openapi";
import { connectionSchema } from "./Connection";
import { clientSchema } from "./Client";
import { tenantSchema } from "./Tenant";

const LegacyClientSchema = z.object({
  ...clientSchema.shape,
  tenant: tenantSchema,
  connections: z.array(connectionSchema),
});

export type LegacyClient = z.infer<typeof LegacyClientSchema>;
