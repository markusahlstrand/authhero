import { z } from "@hono/zod-openapi";
import { SqlBranding } from "./branding/Branding";
import { SqlUser } from "./users/User";
import {
  applicationSchema,
  Code,
  connectionSchema,
  Domain,
  Hook,
  loginSchema,
  Password,
  PromptSetting,
  Session,
  SigningKey,
  Tenant,
  themeSchema,
} from "@authhero/adapter-interfaces";
import { SqlTicket } from "./tickets/Ticket";
import { SqlLog } from "./logs/Log";
import { flattenSchema } from "./flatten";

const sqlThemeSchema = flattenSchema(themeSchema).extend({
  tenant_id: z.string(),
});

type SqlTheme = z.infer<typeof sqlThemeSchema>;

const sqlLoginSchema = flattenSchema(loginSchema).extend({
  tenant_id: z.string(),
});
type SqlLogin = z.infer<typeof sqlLoginSchema>;

const sqlConnectionSchema = flattenSchema(connectionSchema).extend({
  tenant_id: z.string(),
});
type SqlConnection = z.infer<typeof sqlConnectionSchema>;

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
});

export interface Database {
  applications: z.infer<typeof sqlApplicationSchema>;
  branding: SqlBranding;
  codes: Code & { tenant_id: string };
  connections: SqlConnection;
  domains: Domain & { tenant_id: string };
  hooks: Hook & { tenant_id: string };
  keys: SigningKey & { created_at: string };
  logins: SqlLogin;
  logs: SqlLog;
  passwords: Password & { tenant_id: string };
  prompt_settings: PromptSetting & { tenant_id: string };
  users: SqlUser;
  sessions: Session & { tenant_id: string };
  tenants: Tenant;
  themes: SqlTheme;
  tickets: SqlTicket;
}
