import { createUsersAdapter } from "./users";
import { createTenantsAdapter } from "./tenants";
import { createLogsAdapter } from "./logs";
import { Database } from "./db";
import { createSessionsAdapter } from "./sessions";
import { createTicketsAdapter } from "./tickets";
import { createPasswordAdapter } from "./passwords";
import { createCodesAdapter } from "./codes";
import { createApplicationsAdapter } from "./applications";
import { createConnectionsAdapter } from "./connections";
import { Kysely } from "kysely";
import { createClientsAdapter } from "./clients";
import { createKeysAdapter } from "./keys";
import { createDomainsAdapter } from "./domains";
import { createBrandingAdapter } from "./branding";
import { createHooksAdapter } from "./hooks";
import { createThemesAdapter } from "./themes";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { createLoginAdapter } from "./logins";

export default function createAdapters(db: Kysely<Database>): DataAdapters {
  return {
    applications: createApplicationsAdapter(db),
    branding: createBrandingAdapter(db),
    clients: createClientsAdapter(db),
    codes: createCodesAdapter(db),
    connections: createConnectionsAdapter(db),
    domains: createDomainsAdapter(db),
    hooks: createHooksAdapter(db),
    keys: createKeysAdapter(db),
    logins: createLoginAdapter(db),
    logs: createLogsAdapter(db),
    passwords: createPasswordAdapter(db),
    users: createUsersAdapter(db),
    sessions: createSessionsAdapter(db),
    tenants: createTenantsAdapter(db),
    themes: createThemesAdapter(db),
    tickets: createTicketsAdapter(db),
  };
}
