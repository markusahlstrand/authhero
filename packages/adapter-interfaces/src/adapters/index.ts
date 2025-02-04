import { CodesAdapter } from "./Codes";
import { PasswordsAdapter } from "./Passwords";
import { SessionsAdapter } from "./Sessions";
import { TenantsDataAdapter } from "./Tenants";
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
import { PromptSettingsAdapter } from "./PromptSettings";
import { EmailProvidersAdapter } from "./EmailProviders";
import { RefreshTokensAdapter } from "./RefreshTokens";

export interface DataAdapters {
  applications: ApplicationsAdapter;
  branding: BrandingAdapter;
  clients: ClientsAdapter;
  codes: CodesAdapter;
  connections: ConnectionsAdapter;
  domains: DomainsAdapter;
  emailProviders: EmailProvidersAdapter;
  hooks: HooksAdapter;
  keys: KeysAdapter;
  logins: LoginsAdapter;
  logs: LogsDataAdapter;
  passwords: PasswordsAdapter;
  promptSettings: PromptSettingsAdapter;
  refreshTokens: RefreshTokensAdapter;
  sessions: SessionsAdapter;
  tenants: TenantsDataAdapter;
  themes: ThemesAdapter;
  users: UserDataAdapter;
}
