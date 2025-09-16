import { z } from "@hono/zod-openapi";
import { connectionSchema } from "./Connection";
import { clientSchema } from "./Client";
import { tenantSchema } from "./Tenant";

const LegacyClientSchema = z.object({
  ...clientSchema.shape,
  tenant: tenantSchema,
  connections: z.array(connectionSchema),
  // Legacy fields for backward compatibility - these are now stored in client_metadata
  disable_sign_ups: z.boolean(),
  email_validation: z.string(),
});

export type LegacyClient = z.infer<typeof LegacyClientSchema>;
