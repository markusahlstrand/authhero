import { z } from "@hono/zod-openapi";
import { SqlBranding } from "./branding/Branding";
import { SqlAuthenticationCode } from "./authenticationCodes/AuthenticationCode";
import { SqlUser } from "./users/User";
import {
  Application,
  Certificate,
  Code,
  Connection,
  Domain,
  Hook,
  loginSchema,
  Password,
  Session,
  Tenant,
  themeSchema,
} from "@authhero/adapter-interfaces";
import { SqlOTP } from "./otps/OTP";
import { SqlTicket } from "./tickets/Ticket";
import { SqlUniversalLoginSession } from "./universalLoginSessions/UniversalLoginSession";
import { SqlLog } from "./logs/Log";
import { flattenSchema } from "./flattten";

const sqlThemeSchema = flattenSchema(themeSchema).extend({
  tenant_id: z.string(),
});

type SqlTheme = z.infer<typeof sqlThemeSchema>;

const sqlLoginSchema = flattenSchema(loginSchema).extend({
  tenant_id: z.string(),
});
type SqlLogin = z.infer<typeof sqlLoginSchema>;

export interface Database {
  applications: Application & { tenant_id: string };
  authentication_codes: SqlAuthenticationCode;
  branding: SqlBranding;
  codes: Code & { tenant_id: string };
  connections: Connection & { tenant_id: string };
  domains: Domain & { tenant_id: string };
  hooks: Hook & { tenant_id: string };
  keys: Certificate;
  logins: SqlLogin;
  logs: SqlLog;
  otps: SqlOTP;
  passwords: Password & { tenant_id: string };
  users: SqlUser;
  sessions: Session & { tenant_id: string };
  tenants: Tenant;
  themes: SqlTheme;
  tickets: SqlTicket;
  universal_login_sessions: SqlUniversalLoginSession;
}
