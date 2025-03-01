import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";

export const hookInsertSchema = z.object({
  trigger_id: z.enum([
    "pre-user-signup",
    "post-user-registration",
    "post-user-login",
  ]),
  enabled: z.boolean().default(false),
  url: z.string(),
  hook_id: z.string().optional(),
  synchronous: z.boolean().default(false),
  priority: z.number().optional(),
});
export type HookInsert = z.infer<typeof hookInsertSchema>;

export const hookSchema = hookInsertSchema.extend({
  ...baseEntitySchema.shape,
  hook_id: z.string(),
});

export type Hook = z.infer<typeof hookSchema>;
