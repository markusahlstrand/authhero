import { z } from "@hono/zod-openapi";

export const baseEntitySchema = z.object({
  created_at: z.string(),
  updated_at: z.string(),
});
