import { z } from "@hono/zod-openapi";

export const brandingSchema = z.object({
  colors: z
    .object({
      primary: z.string(),
      page_background: z
        .object({
          type: z.string().optional(),
          start: z.string().optional(),
          end: z.string().optional(),
          angle_deg: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  logo_url: z.string().optional(),
  favicon_url: z.string().optional(),
  font: z
    .object({
      url: z.string(),
    })
    .optional(),
});

export type Branding = z.infer<typeof brandingSchema>;
