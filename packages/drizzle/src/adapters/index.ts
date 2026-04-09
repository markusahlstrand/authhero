import { sql } from "drizzle-orm";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { createBrandingAdapter } from "./branding";
import { createClientsAdapter } from "./clients";
import { createClientConnectionsAdapter } from "./clientConnections";
import { createClientGrantsAdapter } from "./clientGrants";
import { createCodesAdapter } from "./codes";
import { createConnectionsAdapter } from "./connections";
import { createCustomDomainsAdapter } from "./customDomains";
import { createCustomTextAdapter } from "./customText";
import { createEmailProvidersAdapter } from "./emailProviders";
import { createFlowsAdapter } from "./flows";
import { createFormsAdapter } from "./forms";
import { createHooksAdapter } from "./hooks";
import { createInvitesAdapter } from "./invites";
import { createKeysAdapter } from "./keys";
import { createLoginSessionsAdapter } from "./loginSessions";
import { createLogsAdapter } from "./logs";
import { createAuthenticationMethodsAdapter } from "./authenticationMethods";
import { createOrganizationsAdapter } from "./organizations";
import { createPasswordsAdapter } from "./passwords";
import { createPromptSettingsAdapter } from "./promptSettings";
import { createRefreshTokensAdapter } from "./refreshTokens";
import { createResourceServersAdapter } from "./resourceServers";
import { createRolePermissionsAdapter } from "./rolePermissions";
import { createUserPermissionsAdapter } from "./userPermissions";
import { createRolesAdapter } from "./roles";
import { createSessionsAdapter } from "./sessions";
import { createTenantsAdapter } from "./tenants";
import { createThemesAdapter } from "./themes";
import { createUniversalLoginTemplatesAdapter } from "./universalLoginTemplates";
import { createUsersAdapter } from "./users";
import { createUserRolesAdapter } from "./userRoles";
import { createUserOrganizationsAdapter } from "./userOrganizations";
import { createStatsAdapter } from "./stats";
import { createOutboxAdapter } from "./outbox";
import { createSessionCleanup } from "./cleanup";
import type { DrizzleDb } from "./types";

export default function createAdapters(
  db: DrizzleDb,
  databaseOptions = { useTransactions: true },
): DataAdapters {
  // Individual adapter factories use loose types internally for pragmatism.
  // The assembled object satisfies DataAdapters at the structural level.
  const adapters = {
    branding: createBrandingAdapter(db),
    clients: createClientsAdapter(db),
    clientConnections: createClientConnectionsAdapter(db),
    clientGrants: createClientGrantsAdapter(db),
    codes: createCodesAdapter(db),
    connections: createConnectionsAdapter(db),
    customDomains: createCustomDomainsAdapter(db),
    customText: createCustomTextAdapter(db),
    emailProviders: createEmailProvidersAdapter(db),
    flows: createFlowsAdapter(db),
    forms: createFormsAdapter(db),
    hooks: createHooksAdapter(db),
    invites: createInvitesAdapter(db),
    keys: createKeysAdapter(db),
    loginSessions: createLoginSessionsAdapter(db),
    logs: createLogsAdapter(db),
    authenticationMethods: createAuthenticationMethodsAdapter(db),
    organizations: createOrganizationsAdapter(db),
    passwords: createPasswordsAdapter(db),
    promptSettings: createPromptSettingsAdapter(db),
    refreshTokens: createRefreshTokensAdapter(db),
    resourceServers: createResourceServersAdapter(db),
    rolePermissions: createRolePermissionsAdapter(db),
    userPermissions: createUserPermissionsAdapter(db),
    roles: createRolesAdapter(db),
    sessions: createSessionsAdapter(db),
    sessionCleanup: createSessionCleanup(db),
    tenants: createTenantsAdapter(db),
    themes: createThemesAdapter(db),
    universalLoginTemplates: createUniversalLoginTemplatesAdapter(db),
    users: createUsersAdapter(db),
    userRoles: createUserRolesAdapter(db),
    userOrganizations: createUserOrganizationsAdapter(db),
    stats: createStatsAdapter(db),
    outbox: createOutboxAdapter(db),
    async transaction<T>(
      fn: (trxAdapters: DataAdapters) => Promise<T>,
    ): Promise<T> {
      if (databaseOptions.useTransactions === false) {
        return fn(adapters);
      }
      // Use manual BEGIN/COMMIT/ROLLBACK so we can properly await the
      // async callback before deciding whether to commit or roll back.
      // Drizzle's built-in db.transaction() runs the callback synchronously
      // for better-sqlite3, which means async throws don't trigger rollback.
      db.run(sql`BEGIN`);
      try {
        const result = await fn(adapters);
        db.run(sql`COMMIT`);
        return result;
      } catch (e) {
        db.run(sql`ROLLBACK`);
        throw e;
      }
    },
  } as unknown as DataAdapters;
  return adapters;
}
