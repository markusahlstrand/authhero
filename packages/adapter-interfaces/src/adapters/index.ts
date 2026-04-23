import { ActionsAdapter } from "./Actions";
import { FlowsAdapter } from "./Flows";
import { CacheAdapter } from "./Cache";
import { ClientsAdapter } from "./Clients";
import { ClientConnectionsAdapter } from "./ClientConnections";
import { ClientGrantsAdapter } from "./ClientGrants";
import { CodesAdapter } from "./Codes";
import { PasswordsAdapter } from "./Passwords";
import { SessionsAdapter } from "./Sessions";
import { TenantsDataAdapter } from "./Tenants";
import { UserDataAdapter } from "./Users";
import { LogsDataAdapter } from "./Logs";
import { ConnectionsAdapter } from "./Connections";
import { CustomDomainsAdapter } from "./CustomDomains";
import { KeysAdapter } from "./Keys";
import { BrandingAdapter } from "./Branding";
import { HooksAdapter } from "./Hooks";
import { HookCodeAdapter } from "./HookCode";
import { ThemesAdapter } from "./Themes";
import { LoginSessionsAdapter } from "./LoginSessions";
import { PromptSettingsAdapter } from "./PromptSettings";
import { EmailProvidersAdapter } from "./EmailProviders";
import { RefreshTokensAdapter } from "./RefreshTokens";
import { FormsAdapter } from "./Forms";
import { ResourceServersAdapter } from "./ResourceServers";
import { RolePermissionsAdapter } from "./RolePermissions";
import { UserPermissionsAdapter } from "./UserPermissions";
import { RolesAdapter } from "./Roles";
import { UserRolesAdapter } from "./UserRoles";
import { OrganizationsAdapter } from "./Organizations";
import { UserOrganizationsAdapter } from "./UserOrganizations";
import { InvitesAdapter } from "./Invites";
import { GeoAdapter } from "./Geo";
import { AuthenticationMethodsAdapter } from "./AuthenticationMethods";
import { StatsAdapter } from "./Stats";
import { UniversalLoginTemplatesAdapter } from "./UniversalLoginTemplates";
import { CustomTextAdapter } from "./CustomText";
import { EmailServiceAdapter } from "./EmailService";
import { SmsServiceAdapter } from "./SmsService";
import { OutboxAdapter } from "./Outbox";

/**
 * Parameters for cleaning up expired sessions
 */
export interface SessionCleanupParams {
  /** Optional tenant ID to scope cleanup to a specific tenant */
  tenant_id?: string;
  /** Optional user ID to scope cleanup to a specific user */
  user_id?: string;
}

export interface DataAdapters {
  actions: ActionsAdapter;
  branding: BrandingAdapter;
  cache?: CacheAdapter;
  clients: ClientsAdapter;
  clientConnections: ClientConnectionsAdapter;
  clientGrants: ClientGrantsAdapter;
  codes: CodesAdapter;
  connections: ConnectionsAdapter;
  customDomains: CustomDomainsAdapter;
  emailProviders: EmailProvidersAdapter;
  flows: FlowsAdapter;
  forms: FormsAdapter;
  geo?: GeoAdapter;
  hookCode: HookCodeAdapter;
  hooks: HooksAdapter;
  invites: InvitesAdapter;
  keys: KeysAdapter;
  loginSessions: LoginSessionsAdapter;
  logs: LogsDataAdapter;
  passwords: PasswordsAdapter;
  promptSettings: PromptSettingsAdapter;
  refreshTokens: RefreshTokensAdapter;
  resourceServers: ResourceServersAdapter;
  rolePermissions: RolePermissionsAdapter;
  userPermissions: UserPermissionsAdapter;
  roles: RolesAdapter;
  sessions: SessionsAdapter;
  stats?: StatsAdapter;
  tenants: TenantsDataAdapter;
  themes: ThemesAdapter;
  universalLoginTemplates: UniversalLoginTemplatesAdapter;
  customText: CustomTextAdapter;
  users: UserDataAdapter;
  userRoles: UserRolesAdapter;
  organizations: OrganizationsAdapter;
  authenticationMethods: AuthenticationMethodsAdapter;
  userOrganizations: UserOrganizationsAdapter;
  emailService?: EmailServiceAdapter;
  smsService?: SmsServiceAdapter;
  /** Optional outbox adapter for transactional audit event capture */
  outbox?: OutboxAdapter;
  /**
   * Execute a callback within a database transaction.
   * The callback receives a set of adapters scoped to the transaction.
   * If the callback throws, the transaction is rolled back.
   */
  transaction<T>(fn: (trxAdapters: DataAdapters) => Promise<T>): Promise<T>;
  /**
   * Optional session cleanup function.
   * Cleans up expired login_sessions, sessions, and refresh_tokens.
   * Can be scoped to a specific tenant and/or user.
   */
  sessionCleanup?: (params?: SessionCleanupParams) => Promise<void>;
  /**
   * Multi-tenancy configuration set by withRuntimeFallback.
   * Used by the tenants route for access control.
   */
  multiTenancyConfig?: {
    controlPlaneTenantId?: string;
    controlPlaneClientId?: string;
  };
}

export * from "./Actions";
export * from "./Flows";
export * from "./Cache";
export * from "./Clients";
export * from "./ClientConnections";
export * from "./ClientGrants";
export * from "./Keys";
export * from "./RolePermissions";
export * from "./UserPermissions";
export * from "./UserRoles";
export * from "./Organizations";
export * from "./UserOrganizations";
export * from "./Invites";
export * from "./Geo";
export * from "./Stats";
export * from "./UniversalLoginTemplates";
export * from "./CustomText";
export * from "./AuthenticationMethods";
export * from "./EmailService";
export * from "./SmsService";
export * from "./Outbox";
export * from "./HookCode";
export * from "./CodeExecutor";
export * from "./RefreshTokens";
