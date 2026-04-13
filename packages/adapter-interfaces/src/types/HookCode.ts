import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";

export const hookCodeInsertSchema = z.object({
  code: z.string().max(100_000),
  secrets: z.record(z.string()).optional(),
});
export type HookCodeInsert = z.infer<typeof hookCodeInsertSchema>;

export const hookCodeSchema = hookCodeInsertSchema.extend({
  id: z.string(),
  tenant_id: z.string(),
  ...baseEntitySchema.shape,
});
export type HookCode = z.infer<typeof hookCodeSchema>;
