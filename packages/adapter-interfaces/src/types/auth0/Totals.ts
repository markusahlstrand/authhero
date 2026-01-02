import { z } from "@hono/zod-openapi";

export const totalsSchema = z.object({
  start: z.number(),
  limit: z.number(),
  length: z.number(),
  total: z.number().optional(),
});

export interface Totals {
  start: number;
  limit: number;
  length: number;
  total?: number;
}
