import { z } from "@hono/zod-openapi";

export const tenantInsertSchema = z.object({
  name: z.string(),
  audience: z.string(),
  sender_email: z.string().email(),
  sender_name: z.string(),
  support_url: z.string().url().optional(),
  logo: z.string().url().optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
  language: z.string().optional(),
});

export const tenantSchema = z.object({
  created_at: z.string().transform((val) => (val === null ? "" : val)),
  updated_at: z.string().transform((val) => (val === null ? "" : val)),
  id: z.string(),
  ...tenantInsertSchema.shape,
});

export interface Tenant {
  id: string;
  name: string;
  audience: string;
  sender_email: string;
  sender_name: string;
  support_url?: string;
  logo?: string;
  primary_color?: string;
  secondary_color?: string;
  language?: string;
  created_at: string;
  updated_at: string;
}

export const vendorSettingsSchema = z.object({
  logoUrl: z.string(),
  loginBackgroundImage: z.string().nullish(),
  style: z.object({
    primaryColor: z.string(),
    buttonTextColor: z.string(),
    primaryHoverColor: z.string(),
  }),
  supportEmail: z.string().nullable(),
  supportUrl: z.string().nullable(),
  name: z.string(),
  showGreyishBackground: z.boolean().optional(),
  termsAndConditionsUrl: z.string().nullable(),
  companyName: z.string().optional(),
  checkoutHideSocial: z.boolean().optional(),
  siteUrl: z.string().nullable(),
  manageSubscriptionsUrl: z.string().optional(),
});

export type VendorSettings = z.infer<typeof vendorSettingsSchema>;
