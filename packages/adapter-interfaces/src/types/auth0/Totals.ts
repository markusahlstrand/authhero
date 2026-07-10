import { z } from "@hono/zod-openapi";

export const totalsSchema = z.object({
  start: z.number(),
  limit: z.number(),
  length: z.number(),
  total: z.number().optional(),
  // Opaque keyset cursor for the next page (checkpoint pagination). Present
  // only when the request used from/take and a further page may exist.
  next: z.string().optional(),
});

export interface Totals {
  start: number;
  limit: number;
  length: number;
  total?: number;
  /**
   * Opaque keyset cursor for the next page. Set only when the caller paginated
   * with from/take and more rows may follow; absent on the last page and for
   * offset (page/per_page) pagination.
   */
  next?: string;
}
