import { CodesAdapter } from "./Codes";
import { OTPAdapter } from "./OTP";
import { PasswordsAdapter } from "./Passwords";
import { SessionsAdapter } from "./Sessions";
import { TenantsDataAdapter } from "./Tenants";
import { TicketsAdapter } from "./Tickets";
import { UserDataAdapter } from "./Users";
import { LogsDataAdapter } from "./Logs";
import { ApplicationsAdapter } from "./Applications";
import { ConnectionsAdapter } from "./Connections";
import { DomainsAdapter } from "./Domains";
import { KeysAdapter } from "./Keys";
import { BrandingAdapter } from "./Branding";
import { HooksAdapter } from "./Hooks";
import { ClientsAdapter } from "./Clients";
import { ThemesAdapter } from "./Themes";
import { LoginsAdapter } from "./Logins";

export interface DataAdapters {
  applications: ApplicationsAdapter;
  branding: BrandingAdapter;
  clients: ClientsAdapter;
  codes: CodesAdapter;
  connections: ConnectionsAdapter;
  domains: DomainsAdapter;
  hooks: HooksAdapter;
  keys: KeysAdapter;
  logins: LoginsAdapter;
  logs: LogsDataAdapter;
  OTP: OTPAdapter;
  passwords: PasswordsAdapter;
  sessions: SessionsAdapter;
  tenants: TenantsDataAdapter;
  themes: ThemesAdapter;
  tickets: TicketsAdapter;
  users: UserDataAdapter;
}
