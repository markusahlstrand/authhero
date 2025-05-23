import { Kysely } from "kysely";
import { createUsersAdapter } from "./users";
import { createTenantsAdapter } from "./tenants";
import { createLogsAdapter } from "./logs";
import { Database } from "./db";
import { createSessionsAdapter } from "./sessions";
import { createPasswordAdapter } from "./passwords";
import { createCodesAdapter } from "./codes";
import { createApplicationsAdapter } from "./applications";
import { createConnectionsAdapter } from "./connections";
import { createClientsAdapter } from "./clients";
import { createKeysAdapter } from "./keys";
import { createCustomDomainsAdapter } from "./customDomains";
import { createBrandingAdapter } from "./branding";
import { createHooksAdapter } from "./hooks";
import { createThemesAdapter } from "./themes";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { createLoginAdapter } from "./loginSessions";
import { createPromptSettingsAdapter } from "./promptSettings";
import { createEmailProvidersAdapter } from "./emailProvideres";
import { createRefreshTokensAdapter } from "./refreshTokens";
import { createCleanup } from "./cleanup";
import { createFormsAdapter } from "./forms";

export { migrateToLatest, migrateDown } from "../migrate/migrate";

export default function createAdapters(db: Kysely<Database>): DataAdapters & {
  cleanup: () => Promise<void>;
} {
  return {
    applications: createApplicationsAdapter(db),
    branding: createBrandingAdapter(db),
    cleanup: createCleanup(db),
    clients: createClientsAdapter(db),
    codes: createCodesAdapter(db),
    connections: createConnectionsAdapter(db),
    emailProviders: createEmailProvidersAdapter(db),
    customDomains: createCustomDomainsAdapter(db),
    forms: createFormsAdapter(db),
    hooks: createHooksAdapter(db),
    keys: createKeysAdapter(db),
    loginSessions: createLoginAdapter(db),
    logs: createLogsAdapter(db),
    passwords: createPasswordAdapter(db),
    promptSettings: createPromptSettingsAdapter(db),
    refreshTokens: createRefreshTokensAdapter(db),
    sessions: createSessionsAdapter(db),
    tenants: createTenantsAdapter(db),
    themes: createThemesAdapter(db),
    users: createUsersAdapter(db),
  };
}
