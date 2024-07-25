import { CodesAdapter } from "./Codes";
import { OTPAdapter } from "./OTP";
import { PasswordsAdapter } from "./Passwords";
import { SessionsAdapter } from "./Sessions";
import { TenantsDataAdapter } from "./Tenants";
import { TicketsAdapter } from "./Tickets";
import { UserDataAdapter } from "./Users";
import { LogsDataAdapter } from "./Logs";
import { ApplicationsAdapter } from "./Applications";
import { UniversalLoginSessionsAdapter } from "./UniversalLoginSession";
import { ConnectionsAdapter } from "./Connections";
import { DomainsAdapter } from "./Domains";
import { KeysAdapter } from "./Keys";
import { BrandingAdapter } from "./Branding";
import { AuthenticationCodesAdapter } from "./AuthenticationCodes";
import { HooksAdapter } from "./Hooks";
import { ClientsAdapter } from "./Clients";
import { ThemesAdapter } from "./Themes";

export interface DataAdapters {
  applications: ApplicationsAdapter;
  authenticationCodes: AuthenticationCodesAdapter;
  branding: BrandingAdapter;
  clients: ClientsAdapter;
  codes: CodesAdapter;
  connections: ConnectionsAdapter;
  domains: DomainsAdapter;
  hooks: HooksAdapter;
  keys: KeysAdapter;
  logs: LogsDataAdapter;
  OTP: OTPAdapter;
  passwords: PasswordsAdapter;
  sessions: SessionsAdapter;
  tenants: TenantsDataAdapter;
  themes: ThemesAdapter;
  tickets: TicketsAdapter;
  universalLoginSessions: UniversalLoginSessionsAdapter;
  users: UserDataAdapter;
}
