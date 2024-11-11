import { z } from "@hono/zod-openapi";
import { SqlBranding } from "./branding/Branding";
import {
  applicationSchema,
  Code,
  connectionSchema,
  Domain,
  hookSchema,
  loginSchema,
  Password,
  promptSettingSchema,
  Session,
  SigningKey,
  Tenant,
  themeSchema,
  userSchema,
} from "@authhero/adapter-interfaces";
import { SqlTicket } from "./tickets/Ticket";
import { SqlLog } from "./logs/Log";
import { flattenSchema } from "./utils/flatten";

const sqlThemeSchema = flattenSchema(themeSchema).extend({
  tenant_id: z.string(),
});

const sqlLoginSchema = flattenSchema(loginSchema).extend({
  tenant_id: z.string(),
});

const sqlConnectionSchema = flattenSchema(connectionSchema).extend({
  tenant_id: z.string(),
});

const sqlApplicationSchema = z.object({
  ...applicationSchema.shape,
  tenant_id: z.string(),
  // The addons will be stored as JSON in a text column
  addons: z.string(),
  disable_sign_ups: z.number(),
  callbacks: z.string(),
  allowed_origins: z.string(),
  web_origins: z.string(),
  allowed_logout_urls: z.string(),
  allowed_clients: z.string(),
});

const sqlPromptSettingSchema = z.object({
  ...promptSettingSchema.shape,
  identifier_first: z.number(),
  password_first: z.number(),
  webauthn_platform_first_factor: z.number(),
  tenant_id: z.string(),
});

const sqlUserSchema = z.object({
  ...userSchema.shape,
  email_verified: z.number(),
  is_social: z.number(),
  app_metadata: z.string(),
  user_metadata: z.string(),
  tenant_id: z.string(),
});

const sqlHookSchema = z.object({
  ...hookSchema.shape,
  tenant_id: z.string(),
  enabled: z.number(),
  synchronous: z.number(),
});

export interface Database {
  applications: z.infer<typeof sqlApplicationSchema>;
  branding: SqlBranding;
  codes: Code & { tenant_id: string };
  connections: z.infer<typeof sqlConnectionSchema>;
  domains: Domain & { tenant_id: string };
  hooks: z.infer<typeof sqlHookSchema>;
  keys: SigningKey & { created_at: string };
  logins: z.infer<typeof sqlLoginSchema>;
  logs: SqlLog;
  passwords: Password & { tenant_id: string };
  prompt_settings: z.infer<typeof sqlPromptSettingSchema>;
  users: z.infer<typeof sqlUserSchema>;
  sessions: Session & { tenant_id: string };
  tenants: Tenant;
  themes: z.infer<typeof sqlThemeSchema>;
  tickets: SqlTicket;
}
