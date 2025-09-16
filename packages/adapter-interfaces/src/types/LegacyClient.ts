import { z } from "@hono/zod-openapi";
import { connectionSchema } from "./Connection";
import { applicationSchema } from "./Application";
import { tenantSchema } from "./Tenant";

const LegacyClientSchema = z.object({
  ...applicationSchema.shape,
  tenant: tenantSchema,
  connections: z.array(connectionSchema),
});

export type LegacyClient = z.infer<typeof LegacyClientSchema>;
