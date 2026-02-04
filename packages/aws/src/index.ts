import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { DynamoDBConfig, DynamoDBContext } from "./types";

// Import adapters
import { createFlowsAdapter } from "./adapters/flows";
import { createTenantsAdapter } from "./adapters/tenants";
import { createUsersAdapter } from "./adapters/users";
import { createSessionsAdapter } from "./adapters/sessions";
import { createPasswordsAdapter } from "./adapters/passwords";
import { createCodesAdapter } from "./adapters/codes";
import { createClientsAdapter } from "./adapters/clients";
import { createClientGrantsAdapter } from "./adapters/clientGrants";
import { createClientConnectionsAdapter } from "./adapters/clientConnections";
import { createConnectionsAdapter } from "./adapters/connections";
import { createLoginSessionsAdapter } from "./adapters/loginSessions";
import { createBrandingAdapter } from "./adapters/branding";
import { createUniversalLoginTemplatesAdapter } from "./adapters/universalLoginTemplates";
import { createHooksAdapter } from "./adapters/hooks";
import { createKeysAdapter } from "./adapters/keys";
import { createCustomDomainsAdapter } from "./adapters/customDomains";
import { createLogsAdapter } from "./adapters/logs";
import { createThemesAdapter } from "./adapters/themes";
import { createPromptSettingsAdapter } from "./adapters/promptSettings";
import { createEmailProvidersAdapter } from "./adapters/emailProviders";
import { createRefreshTokensAdapter } from "./adapters/refreshTokens";
import { createFormsAdapter } from "./adapters/forms";
import { createResourceServersAdapter } from "./adapters/resourceServers";
import { createRolesAdapter } from "./adapters/roles";
import { createRolePermissionsAdapter } from "./adapters/rolePermissions";
import { createUserPermissionsAdapter } from "./adapters/userPermissions";
import { createUserRolesAdapter } from "./adapters/userRoles";
import { createOrganizationsAdapter } from "./adapters/organizations";
import { createUserOrganizationsAdapter } from "./adapters/userOrganizations";
import { createInvitesAdapter } from "./adapters/invites";
import { createCustomTextAdapter } from "./adapters/customText";

export type { DynamoDBConfig, DynamoDBContext } from "./types";

/**
 * Create all DynamoDB adapters for AuthHero
 *
 * @param client - DynamoDB Document Client instance
 * @param config - Configuration options including table name
 * @returns DataAdapters object with all adapter implementations
 *
 * @example
 * ```typescript
 * import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
 * import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
 * import createAdapters from "@authhero/aws-adapter";
 *
 * const client = new DynamoDBClient({});
 * const docClient = DynamoDBDocumentClient.from(client);
 *
 * const adapters = createAdapters(docClient, {
 *   tableName: "authhero",
 * });
 * ```
 */
export default function createAdapters(
  client: DynamoDBDocumentClient,
  config: DynamoDBConfig,
): DataAdapters {
  const ctx: DynamoDBContext = {
    client,
    tableName: config.tableName,
  };

  return {
    branding: createBrandingAdapter(ctx),
    clients: createClientsAdapter(ctx),
    clientConnections: createClientConnectionsAdapter(ctx),
    clientGrants: createClientGrantsAdapter(ctx),
    codes: createCodesAdapter(ctx),
    connections: createConnectionsAdapter(ctx),
    customDomains: createCustomDomainsAdapter(ctx),
    emailProviders: createEmailProvidersAdapter(ctx),
    flows: createFlowsAdapter(ctx),
    forms: createFormsAdapter(ctx),
    hooks: createHooksAdapter(ctx),
    invites: createInvitesAdapter(ctx),
    keys: createKeysAdapter(ctx),
    loginSessions: createLoginSessionsAdapter(ctx),
    logs: createLogsAdapter(ctx),
    organizations: createOrganizationsAdapter(ctx),
    passwords: createPasswordsAdapter(ctx),
    promptSettings: createPromptSettingsAdapter(ctx),
    refreshTokens: createRefreshTokensAdapter(ctx),
    resourceServers: createResourceServersAdapter(ctx),
    rolePermissions: createRolePermissionsAdapter(ctx),
    roles: createRolesAdapter(ctx),
    sessions: createSessionsAdapter(ctx),
    tenants: createTenantsAdapter(ctx),
    themes: createThemesAdapter(ctx),
    universalLoginTemplates: createUniversalLoginTemplatesAdapter(ctx),
    customText: createCustomTextAdapter(ctx),
    userOrganizations: createUserOrganizationsAdapter(ctx),
    userPermissions: createUserPermissionsAdapter(ctx),
    userRoles: createUserRolesAdapter(ctx),
    users: createUsersAdapter(ctx),
  };
}

// Re-export individual adapters for custom usage
export { createTenantsAdapter } from "./adapters/tenants";
export { createUsersAdapter } from "./adapters/users";
export { createSessionsAdapter } from "./adapters/sessions";
export { createPasswordsAdapter } from "./adapters/passwords";
export { createCodesAdapter } from "./adapters/codes";
export { createClientsAdapter } from "./adapters/clients";
export { createClientGrantsAdapter } from "./adapters/clientGrants";
export { createClientConnectionsAdapter } from "./adapters/clientConnections";
export { createConnectionsAdapter } from "./adapters/connections";
export { createLoginSessionsAdapter } from "./adapters/loginSessions";
export { createBrandingAdapter } from "./adapters/branding";
export { createHooksAdapter } from "./adapters/hooks";
export { createKeysAdapter } from "./adapters/keys";
export { createCustomDomainsAdapter } from "./adapters/customDomains";
export { createLogsAdapter } from "./adapters/logs";
export { createThemesAdapter } from "./adapters/themes";
export { createPromptSettingsAdapter } from "./adapters/promptSettings";
export { createEmailProvidersAdapter } from "./adapters/emailProviders";
export { createRefreshTokensAdapter } from "./adapters/refreshTokens";
export { createFormsAdapter } from "./adapters/forms";
export { createResourceServersAdapter } from "./adapters/resourceServers";
export { createRolesAdapter } from "./adapters/roles";
export { createRolePermissionsAdapter } from "./adapters/rolePermissions";
export { createUserPermissionsAdapter } from "./adapters/userPermissions";
export { createUserRolesAdapter } from "./adapters/userRoles";
export { createOrganizationsAdapter } from "./adapters/organizations";
export { createUserOrganizationsAdapter } from "./adapters/userOrganizations";
export { createInvitesAdapter } from "./adapters/invites";
export { createFlowsAdapter } from "./adapters/flows";

// Re-export utilities for custom implementations
export * from "./keys";
export * from "./utils";
