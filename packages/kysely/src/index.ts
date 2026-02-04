import { Kysely } from "kysely";
import { createUsersAdapter } from "./users";
import { createFlowsAdapter } from "./flows";
import { createTenantsAdapter } from "./tenants";
import { createLogsAdapter } from "./logs";
import { Database } from "./db";
import { createSessionsAdapter } from "./sessions";
import { createPasswordAdapter } from "./passwords";
import { createCodesAdapter } from "./codes";
import { createConnectionsAdapter } from "./connections";
import { createClientsAdapter } from "./clients";
import { createClientConnectionsAdapter } from "./clientConnections";
import { createClientGrantsAdapter } from "./clientGrants";
import { createKeysAdapter } from "./keys";
import { createCustomDomainsAdapter } from "./customDomains";
import { createBrandingAdapter } from "./branding";
import { createUniversalLoginTemplatesAdapter } from "./universalLoginTemplates";
import { createHooksAdapter } from "./hooks";
import { createThemesAdapter } from "./themes";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { createLoginAdapter } from "./loginSessions";
import { createPromptSettingsAdapter } from "./promptSettings";
import { createEmailProvidersAdapter } from "./emailProvideres";
import { createRefreshTokensAdapter } from "./refreshTokens";
import { createCleanup, createSessionCleanup } from "./cleanup";
import { createFormsAdapter } from "./forms";
import { createResourceServersAdapter } from "./resourceServers";
import { createRolesAdapter } from "./roles";
import { rolePermissions } from "./role-permissions";
import { createUserPermissionsAdapter } from "./user-permissions/adapter";
import { createUserRolesAdapter } from "./user-roles/adapter";
import { createOrganizationsAdapter } from "./organizations";
import { createUserOrganizationsAdapter } from "./user-organizations";
import { createInvitesAdapter } from "./invites";
import { createStatsAdapter } from "./stats";
import { createCustomTextAdapter } from "./customText";

export { migrateToLatest, migrateDown } from "../migrate/migrate";

export default function createAdapters(db: Kysely<Database>): DataAdapters & {
  cleanup: () => Promise<void>;
} {
  return {
    branding: createBrandingAdapter(db),
    cleanup: createCleanup(db),
    clients: createClientsAdapter(db),
    clientConnections: createClientConnectionsAdapter(db),
    clientGrants: createClientGrantsAdapter(db),
    codes: createCodesAdapter(db),
    connections: createConnectionsAdapter(db),
    emailProviders: createEmailProvidersAdapter(db),
    customDomains: createCustomDomainsAdapter(db),
    flows: createFlowsAdapter(db),
    forms: createFormsAdapter(db),
    hooks: createHooksAdapter(db),
    invites: createInvitesAdapter(db),
    keys: createKeysAdapter(db),
    loginSessions: createLoginAdapter(db),
    logs: createLogsAdapter(db),
    passwords: createPasswordAdapter(db),
    promptSettings: createPromptSettingsAdapter(db),
    refreshTokens: createRefreshTokensAdapter(db),
    resourceServers: createResourceServersAdapter(db),
    rolePermissions: rolePermissions(db),
    userPermissions: createUserPermissionsAdapter(db),
    userRoles: createUserRolesAdapter(db),
    roles: createRolesAdapter(db),
    sessions: createSessionsAdapter(db),
    sessionCleanup: createSessionCleanup(db),
    tenants: createTenantsAdapter(db),
    themes: createThemesAdapter(db),
    universalLoginTemplates: createUniversalLoginTemplatesAdapter(db),
    customText: createCustomTextAdapter(db),
    users: createUsersAdapter(db),
    organizations: createOrganizationsAdapter(db),
    userOrganizations: createUserOrganizationsAdapter(db),
    stats: createStatsAdapter(db),
  };
}
