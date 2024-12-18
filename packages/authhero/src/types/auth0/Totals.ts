import { z } from "@hono/zod-openapi";

export const totalsSchema = z.object({
  start: z.number(),
  limit: z.number(),
  length: z.number(),
});

export interface Totals {
  start: number;
  limit: number;
  length: number;
}
