import { ActionsAdapter } from "./Actions";
import { ActionExecutionsAdapter } from "./ActionExecutions";
import { ActionVersionsAdapter } from "./ActionVersions";
import { FlowsAdapter } from "./Flows";
import { CacheAdapter } from "./Cache";
import { ClientsAdapter } from "./Clients";
import { ClientConnectionsAdapter } from "./ClientConnections";
import { ClientGrantsAdapter } from "./ClientGrants";
import { ClientRegistrationTokensAdapter } from "./ClientRegistrationTokens";
import { CodesAdapter } from "./Codes";
import { PasswordsAdapter } from "./Passwords";
import { SessionsAdapter } from "./Sessions";
import { TenantsDataAdapter } from "./Tenants";
import { UserDataAdapter } from "./Users";
import { LogsDataAdapter } from "./Logs";
import { LogStreamsAdapter } from "./LogStreams";
import { MigrationSourcesAdapter } from "./MigrationSources";
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
import { EmailTemplatesAdapter } from "./EmailTemplates";
import { RefreshTokensAdapter } from "./RefreshTokens";
import { FormsAdapter } from "./Forms";
import { ResourceServersAdapter } from "./ResourceServers";
import { RolePermissionsAdapter } from "./RolePermissions";
import { UserPermissionsAdapter } from "./UserPermissions";
import { RolesAdapter } from "./Roles";
import { UserRolesAdapter } from "./UserRoles";
import { OrganizationsAdapter } from "./Organizations";
import { OrganizationConnectionsAdapter } from "./OrganizationConnections";
import { UserOrganizationsAdapter } from "./UserOrganizations";
import { InvitesAdapter } from "./Invites";
import { GeoAdapter } from "./Geo";
import { AuthenticationMethodsAdapter } from "./AuthenticationMethods";
import { StatsAdapter } from "./Stats";
import { AnalyticsAdapter } from "./Analytics";
import { UniversalLoginTemplatesAdapter } from "./UniversalLoginTemplates";
import { CustomTextAdapter } from "./CustomText";
import { EmailServiceAdapter } from "./EmailService";
import { SmsServiceAdapter } from "./SmsService";
import { OutboxAdapter } from "./Outbox";
import { RateLimitAdapter } from "./RateLimit";

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
  actionExecutions: ActionExecutionsAdapter;
  actionVersions: ActionVersionsAdapter;
  branding: BrandingAdapter;
  cache?: CacheAdapter;
  clients: ClientsAdapter;
  clientConnections: ClientConnectionsAdapter;
  clientGrants: ClientGrantsAdapter;
  clientRegistrationTokens?: ClientRegistrationTokensAdapter;
  codes: CodesAdapter;
  connections: ConnectionsAdapter;
  customDomains: CustomDomainsAdapter;
  emailProviders: EmailProvidersAdapter;
  emailTemplates: EmailTemplatesAdapter;
  flows: FlowsAdapter;
  forms: FormsAdapter;
  geo?: GeoAdapter;
  hookCode: HookCodeAdapter;
  hooks: HooksAdapter;
  invites: InvitesAdapter;
  keys: KeysAdapter;
  loginSessions: LoginSessionsAdapter;
  logs: LogsDataAdapter;
  logStreams?: LogStreamsAdapter;
  /**
   * Optional tenant-level migration sources for lazy refresh-token re-mint
   * against upstream IdPs (Auth0, Cognito, Okta, generic OIDC). When unset,
   * unrecognized refresh tokens fail with `invalid_grant` as usual.
   */
  migrationSources?: MigrationSourcesAdapter;
  passwords: PasswordsAdapter;
  promptSettings: PromptSettingsAdapter;
  refreshTokens: RefreshTokensAdapter;
  resourceServers: ResourceServersAdapter;
  rolePermissions: RolePermissionsAdapter;
  userPermissions: UserPermissionsAdapter;
  roles: RolesAdapter;
  sessions: SessionsAdapter;
  stats?: StatsAdapter;
  /**
   * Optional richer analytics surface, exposed via `/api/v2/analytics/*`.
   * Returns ClickHouse-style `{ meta, data }` responses with filtering and
   * grouping. Unlike `stats`, this is not Auth0 wire-compatible.
   */
  analytics?: AnalyticsAdapter;
  tenants: TenantsDataAdapter;
  themes: ThemesAdapter;
  universalLoginTemplates: UniversalLoginTemplatesAdapter;
  customText: CustomTextAdapter;
  users: UserDataAdapter;
  userRoles: UserRolesAdapter;
  organizations: OrganizationsAdapter;
  organizationConnections: OrganizationConnectionsAdapter;
  authenticationMethods: AuthenticationMethodsAdapter;
  userOrganizations: UserOrganizationsAdapter;
  emailService?: EmailServiceAdapter;
  smsService?: SmsServiceAdapter;
  /** Optional outbox adapter for transactional audit event capture */
  outbox?: OutboxAdapter;
  /**
   * Optional rate-limit adapter for short-window abuse protection
   * (e.g. backed by the Cloudflare Workers Rate Limiter binding).
   * Auth flows treat this as opt-in: when undefined, no extra
   * throttling is applied.
   */
  rateLimit?: RateLimitAdapter;
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
   * Used by the tenants route for access control and by runtime helpers
   * (e.g. `getEnrichedClient`) to decide which control plane to inherit from.
   */
  multiTenancyConfig?: {
    controlPlaneTenantId?: string;
    controlPlaneClientId?: string;
    /**
     * Per-tenant override for runtime inheritance lookups. When defined,
     * runtime helpers must consult it for the tenant being read instead of
     * relying on the static `controlPlaneTenantId` / `controlPlaneClientId`.
     * Return `undefined` to opt that tenant out of inheritance.
     *
     * Access control, sync direction, and tenant management routing always
     * use the static `controlPlaneTenantId` and are not affected by this
     * resolver.
     */
    resolveControlPlane?: (params: { tenant_id: string }) =>
      | { tenantId: string; clientId?: string }
      | undefined
      | Promise<{ tenantId: string; clientId?: string } | undefined>;
  };
}

export * from "./Actions";
export * from "./ActionExecutions";
export * from "./ActionVersions";
export * from "./Flows";
export * from "./Cache";
export * from "./Clients";
export * from "./ClientConnections";
export * from "./ClientGrants";
export * from "./ClientRegistrationTokens";
export * from "./Keys";
export * from "./RolePermissions";
export * from "./UserPermissions";
export * from "./UserRoles";
export * from "./Organizations";
export * from "./OrganizationConnections";
export * from "./UserOrganizations";
export * from "./Invites";
export * from "./Geo";
export * from "./Stats";
export * from "./Analytics";
export * from "./UniversalLoginTemplates";
export * from "./CustomText";
export * from "./AuthenticationMethods";
export * from "./LogStreams";
export * from "./MigrationSources";
export * from "./EmailService";
export * from "./SmsService";
export * from "./Outbox";
export * from "./RateLimit";
export * from "./HookCode";
export * from "./CodeExecutor";
export * from "./RefreshTokens";
export * from "./Branding";
export * from "./Codes";
export * from "./Connections";
export * from "./CustomDomains";
export * from "./EmailProviders";
export * from "./EmailTemplates";
export * from "./Forms";
export * from "./Hooks";
export * from "./LoginSessions";
export * from "./Logs";
export * from "./Passwords";
export * from "./PromptSettings";
export * from "./ResourceServers";
export * from "./Roles";
export * from "./Sessions";
export * from "./TenantSettings";
export * from "./Tenants";
export * from "./Themes";
export * from "./Users";
