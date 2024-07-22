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
import { ClientsAdapter } from "./Cilent";

export interface DataAdapters {
  applications: ApplicationsAdapter;
  branding: BrandingAdapter;
  codes: CodesAdapter;
  // TODO: This is a temporary adapter until we can pass the tenant-id
  client: ClientsAdapter;
  OTP: OTPAdapter;
  passwords: PasswordsAdapter;
  sessions: SessionsAdapter;
  tenants: TenantsDataAdapter;
  tickets: TicketsAdapter;
  universalLoginSessions: UniversalLoginSessionsAdapter;
  users: UserDataAdapter;
  logs: LogsDataAdapter;
  connections: ConnectionsAdapter;
  domains: DomainsAdapter;
  keys: KeysAdapter;
  hooks: HooksAdapter;
  authenticationCodes: AuthenticationCodesAdapter;
}
