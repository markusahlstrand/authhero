import { z } from "@hono/zod-openapi";

export const querySchema = z.object({
  page: z
    .string()
    .min(0)
    .optional()
    .default("0")
    .transform((p) => parseInt(p, 10))
    .openapi({
      description: "Page index of the results to return. First page is 0.",
    }),
  per_page: z
    .string()
    .min(1)
    .optional()
    .default("10")
    .transform((p) => parseInt(p, 10))
    .openapi({
      description: "Number of results per page. Defaults to 50.",
    }),
  include_totals: z
    .string()
    .optional()
    .default("false")
    .transform((it) => it === "true")
    .openapi({
      description:
        "Return results inside an object that contains the total result count (true) or as a direct array of results (false, default).",
    }),
  from: z.string().optional().openapi({
    description: "Optional Id from which to start selection.",
  }),
  take: z
    .string()
    .optional()
    .transform((t) => (t ? parseInt(t, 10) : undefined))
    .openapi({
      description: "Number of results per page. Defaults to 50.",
    }),
  sort: z
    .string()
    .regex(/^.+:(-1|1)$/)
    .optional()
    .openapi({
      description:
        "Field to sort by. Use field:order where order is 1 for ascending and -1 for descending. e.g. created_at:1.",
    }),
  q: z.string().optional().openapi({
    description: "A lucene query string used to filter the results",
  }),
});
