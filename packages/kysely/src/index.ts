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
import { createDomainsAdapter } from "./domains";
import { createBrandingAdapter } from "./branding";
import { createHooksAdapter } from "./hooks";
import { createThemesAdapter } from "./themes";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { createLoginAdapter } from "./logins";
import { createPromptSettingsAdapter } from "./promptSettings";
import { createEmailProvidersAdapter } from "./emailProvideres";
import { createRefreshTokensAdapter } from "./refreshTokens";

export { migrateToLatest, migrateDown } from "../migrate/migrate";

export default function createAdapters(db: Kysely<Database>): DataAdapters {
  return {
    applications: createApplicationsAdapter(db),
    branding: createBrandingAdapter(db),
    clients: createClientsAdapter(db),
    codes: createCodesAdapter(db),
    connections: createConnectionsAdapter(db),
    emailProviders: createEmailProvidersAdapter(db),
    domains: createDomainsAdapter(db),
    hooks: createHooksAdapter(db),
    keys: createKeysAdapter(db),
    logins: createLoginAdapter(db),
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
