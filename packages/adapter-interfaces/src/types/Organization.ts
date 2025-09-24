import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";

export const organizationBrandingSchema = z
  .object({
    logo_url: z.string().optional().openapi({
      description: "URL of the organization's logo",
    }),
    colors: z
      .object({
        primary: z.string().optional().openapi({
          description: "Primary color in hex format (e.g., #FF0000)",
        }),
        page_background: z.string().optional().openapi({
          description: "Page background color in hex format (e.g., #FFFFFF)",
        }),
      })
      .optional(),
  })
  .optional();

export const organizationEnabledConnectionSchema = z.object({
  connection_id: z.string().openapi({
    description: "ID of the connection",
  }),
  assign_membership_on_login: z.boolean().default(false).openapi({
    description: "Whether to assign membership to the organization on login",
  }),
  show_as_button: z.boolean().default(true).openapi({
    description:
      "Whether to show this connection as a button in the login screen",
  }),
  is_signup_enabled: z.boolean().default(true).openapi({
    description: "Whether signup is enabled for this connection",
  }),
});

export const organizationTokenQuotaSchema = z
  .object({
    client_credentials: z
      .object({
        enforce: z.boolean().default(false).openapi({
          description: "Whether to enforce token quota limits",
        }),
        per_day: z.number().min(0).default(0).openapi({
          description: "Maximum tokens per day (0 = unlimited)",
        }),
        per_hour: z.number().min(0).default(0).openapi({
          description: "Maximum tokens per hour (0 = unlimited)",
        }),
      })
      .optional(),
  })
  .optional();

export const organizationInsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).openapi({
    description: "The name of the organization",
  }),
  display_name: z.string().optional().openapi({
    description: "The display name of the organization",
  }),
  branding: organizationBrandingSchema,
  metadata: z.record(z.string(), z.string()).default({}).optional().openapi({
    description: "Custom metadata for the organization",
  }),
  enabled_connections: z
    .array(organizationEnabledConnectionSchema)
    .default([])
    .optional()
    .openapi({
      description: "List of enabled connections for the organization",
    }),
  token_quota: organizationTokenQuotaSchema,
});

export type OrganizationInsert = z.infer<typeof organizationInsertSchema>;

export const organizationSchema = z.object({
  ...organizationInsertSchema.shape,
  ...baseEntitySchema.shape,
  id: z.string(),
});

export type Organization = z.infer<typeof organizationSchema>;
