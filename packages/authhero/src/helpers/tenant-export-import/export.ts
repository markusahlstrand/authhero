import { DataAdapters, ListParams } from "@authhero/adapter-interfaces";
import { ExportLine, ExportOptions } from "./types";
import { asRecord, getString } from "./row-access";

const PAGE_SIZE = 100;

/**
 * Drain a tenant-wide paginated `list` adapter that returns
 * `{ [plural]: Row[]; ... }` with Auth0-style page/per_page pagination. Yields
 * every row across all pages. The adapter's concrete response type is read
 * structurally (via {@link asRecord}) so any `ListXResponse` shape is accepted
 * without an index signature.
 */
async function* paginate(
  pluralKey: string,
  list: (tenant_id: string, params?: ListParams) => Promise<unknown>,
  tenant_id: string,
): AsyncGenerator<unknown> {
  let page = 0;
  // Safety bound: avoid an infinite loop if an adapter ignores pagination.
  // 10k pages * 100 rows = 1M rows, far beyond any realistic single tenant.
  // Fail closed if the cap is hit so a partial export is never mistaken for a
  // complete one.
  const maxPages = 10_000;
  for (;;) {
    const result = await list(tenant_id, {
      page,
      per_page: PAGE_SIZE,
      include_totals: false,
    });
    const rows = asRecord(result)?.[pluralKey];
    if (!Array.isArray(rows)) {
      throw new Error(`Invalid list response for "${pluralKey}" during export`);
    }
    if (rows.length === 0) break;
    for (const row of rows) {
      yield row;
    }
    if (rows.length < PAGE_SIZE) break;
    page += 1;
    if (page >= maxPages) {
      throw new Error(
        `Export exceeded pagination safety cap (${maxPages} pages) for "${pluralKey}"`,
      );
    }
  }
}

function line(entity: string, data: unknown): ExportLine {
  return { entity, data };
}

/**
 * Lazily yield an ordered stream of `{ entity, data }` lines covering all
 * durable data for `tenant_id`. The order matches {@link EXPORT_ORDER} so a
 * sequential importer satisfies foreign keys (parents before children).
 *
 * This is a generator so the HTTP layer can serialize each line straight to the
 * response (and into gzip) without ever materializing the whole export in
 * memory. Only bounded per-entity working sets (id lists, the hook buffer) are
 * held at a time.
 *
 * Ephemeral/audit entities and the global key pool are never emitted.
 */
export async function* exportTenantLines(
  data: DataAdapters,
  tenant_id: string,
  opts: ExportOptions,
): AsyncGenerator<ExportLine> {
  // tenants(self)
  const tenant = await data.tenants.get(tenant_id);
  if (tenant) {
    yield line("tenants", tenant);
  }

  // clients
  const clientIds: string[] = [];
  for await (const client of paginate(
    "clients",
    (t, p) => data.clients.list(t, p),
    tenant_id,
  )) {
    yield line("clients", client);
    const id = getString(client, "client_id");
    if (id) clientIds.push(id);
  }

  // connections
  for await (const connection of paginate(
    "connections",
    (t, p) => data.connections.list(t, p),
    tenant_id,
  )) {
    yield line("connections", connection);
  }

  // resource_servers
  for await (const resourceServer of paginate(
    "resource_servers",
    (t, p) => data.resourceServers.list(t, p),
    tenant_id,
  )) {
    yield line("resource_servers", resourceServer);
  }

  // roles
  const roleIds: string[] = [];
  for await (const role of paginate(
    "roles",
    (t, p) => data.roles.list(t, p),
    tenant_id,
  )) {
    yield line("roles", role);
    const id = getString(role, "id");
    if (id) roleIds.push(id);
  }

  // organizations
  const organizationIds: string[] = [];
  for await (const organization of paginate(
    "organizations",
    (t, p) => data.organizations.list(t, p),
    tenant_id,
  )) {
    yield line("organizations", organization);
    const id = getString(organization, "id");
    if (id) organizationIds.push(id);
  }

  // users
  const userIds: string[] = [];
  for await (const user of paginate(
    "users",
    (t, p) => data.users.list(t, p),
    tenant_id,
  )) {
    yield line("users", user);
    const id = getString(user, "user_id");
    if (id) userIds.push(id);
  }

  // passwords (per user) — only when explicitly requested
  if (opts.includePasswordHashes) {
    for (const userId of userIds) {
      const passwords = await data.passwords.list(tenant_id, userId);
      for (const password of passwords) {
        yield line("passwords", password);
      }
    }
  }

  // authentication_methods (per user)
  for (const userId of userIds) {
    const methods = await data.authenticationMethods.list(tenant_id, userId);
    for (const method of methods) {
      yield line("authentication_methods", method);
    }
  }

  // user_roles (per user) — list returns Role[]; emit {user_id, role_id}
  for (const userId of userIds) {
    const roles = await data.userRoles.list(tenant_id, userId);
    for (const role of roles) {
      const roleId = getString(role, "id");
      if (roleId) {
        yield line("user_roles", { user_id: userId, role_id: roleId });
      }
    }
  }

  // user_permissions (per user) — carry user_id so the importer can target it
  for (const userId of userIds) {
    const permissions = await data.userPermissions.list(tenant_id, userId);
    for (const permission of permissions) {
      yield line("user_permissions", { user_id: userId, permission });
    }
  }

  // role_permissions (per role) — carry role_id so the importer can target it
  for (const roleId of roleIds) {
    const permissions = await data.rolePermissions.list(tenant_id, roleId);
    for (const permission of permissions) {
      yield line("role_permissions", { role_id: roleId, permission });
    }
  }

  // organization_connections (per organization)
  for (const organizationId of organizationIds) {
    const connections = await data.organizationConnections.list(
      tenant_id,
      organizationId,
    );
    for (const connection of connections) {
      yield line("organization_connections", {
        ...connection,
        organization_id: organizationId,
      });
    }
  }

  // user_organizations (tenant-wide)
  for await (const userOrganization of paginate(
    "userOrganizations",
    (t, p) => data.userOrganizations.list(t, p),
    tenant_id,
  )) {
    yield line("user_organizations", userOrganization);
  }

  // client_grants
  for await (const clientGrant of paginate(
    "client_grants",
    (t, p) => data.clientGrants.list(t, p),
    tenant_id,
  )) {
    yield line("client_grants", clientGrant);
  }

  // invites
  for await (const invite of paginate(
    "invites",
    (t, p) => data.invites.list(t, p),
    tenant_id,
  )) {
    yield line("invites", invite);
  }

  // actions + action_versions (nested per action)
  const actionIds: string[] = [];
  for await (const action of paginate(
    "actions",
    (t, p) => data.actions.list(t, p),
    tenant_id,
  )) {
    yield line("actions", action);
    const id = getString(action, "id");
    if (id) actionIds.push(id);
  }
  for (const actionId of actionIds) {
    let page = 0;
    for (;;) {
      const result = await data.actionVersions.list(tenant_id, actionId, {
        page,
        per_page: PAGE_SIZE,
        include_totals: false,
      });
      const versions = result.versions;
      if (versions.length === 0) break;
      for (const version of versions) {
        yield line("action_versions", version);
      }
      if (versions.length < PAGE_SIZE) break;
      page += 1;
      if (page >= 10_000) {
        throw new Error(
          `Export exceeded pagination safety cap for action_versions of action "${actionId}"`,
        );
      }
    }
  }

  // hooks + hook_code (best-effort: code hooks reference a hook_code by
  // code_id). Emit hook_code first so a sequential importer has the referenced
  // code rows before the hooks that depend on them.
  const codeIds = new Set<string>();
  const hooks: unknown[] = [];
  for await (const hook of paginate(
    "hooks",
    (t, p) => data.hooks.list(t, p),
    tenant_id,
  )) {
    hooks.push(hook);
    const codeId = getString(hook, "code_id");
    if (codeId) codeIds.add(codeId);
  }
  for (const codeId of codeIds) {
    const hookCode = await data.hookCode.get(tenant_id, codeId);
    if (hookCode) {
      yield line("hook_code", hookCode);
    }
  }
  for (const hook of hooks) {
    yield line("hooks", hook);
  }

  // flows
  for await (const flow of paginate(
    "flows",
    (t, p) => data.flows.list(t, p),
    tenant_id,
  )) {
    yield line("flows", flow);
  }

  // forms
  for await (const form of paginate(
    "forms",
    (t, p) => data.forms.list(t, p),
    tenant_id,
  )) {
    yield line("forms", form);
  }

  // theme (singleton — mirrors Auth0's single "default" theme per tenant)
  const theme = await data.themes.get(tenant_id, "default");
  if (theme) {
    yield line("themes", theme);
  }

  // branding (singleton)
  const branding = await data.branding.get(tenant_id);
  if (branding) {
    yield line("branding", branding);
  }

  // prompt_settings (singleton)
  const promptSettings = await data.promptSettings.get(tenant_id);
  if (promptSettings) {
    yield line("prompt_settings", promptSettings);
  }

  // universal_login_templates (singleton)
  const universalLoginTemplate =
    await data.universalLoginTemplates.get(tenant_id);
  if (universalLoginTemplate) {
    yield line("universal_login_templates", universalLoginTemplate);
  }

  // custom_text (per prompt/language)
  const customTextEntries = await data.customText.list(tenant_id);
  for (const entry of customTextEntries) {
    const customText = await data.customText.get(
      tenant_id,
      entry.prompt,
      entry.language,
    );
    if (customText) {
      yield line("custom_text", {
        prompt: entry.prompt,
        language: entry.language,
        custom_text: customText,
      });
    }
  }

  // email_providers (singleton)
  const emailProvider = await data.emailProviders.get(tenant_id);
  if (emailProvider) {
    yield line("email_providers", emailProvider);
  }

  // email_templates (tenant-wide, no pagination)
  const emailTemplates = await data.emailTemplates.list(tenant_id);
  for (const emailTemplate of emailTemplates) {
    yield line("email_templates", emailTemplate);
  }

  // custom_domains (tenant-wide, no pagination)
  const customDomains = await data.customDomains.list(tenant_id);
  for (const customDomain of customDomains) {
    yield line("custom_domains", customDomain);
  }

  // log_streams (optional adapter)
  if (data.logStreams) {
    const logStreams = await data.logStreams.list(tenant_id);
    for (const logStream of logStreams) {
      yield line("log_streams", logStream);
    }
  }

  // migration_sources (optional adapter)
  if (data.migrationSources) {
    const migrationSources = await data.migrationSources.list(tenant_id);
    for (const migrationSource of migrationSources) {
      yield line("migration_sources", migrationSource);
    }
  }

  // proxy_routes (optional adapter)
  if (data.proxyRoutes) {
    let page = 0;
    for (;;) {
      const result = await data.proxyRoutes.list(tenant_id, {
        page,
        per_page: PAGE_SIZE,
      });
      const routes = result.proxy_routes;
      if (routes.length === 0) break;
      for (const route of routes) {
        yield line("proxy_routes", route);
      }
      if (routes.length < PAGE_SIZE) break;
      page += 1;
      if (page >= 10_000) {
        throw new Error(
          "Export exceeded pagination safety cap for proxy_routes",
        );
      }
    }
  }
}

/**
 * Collect {@link exportTenantLines} into an array. Convenience for callers
 * (e.g. tests) that want the whole export in memory; the HTTP layer streams the
 * generator directly instead.
 */
export async function exportTenant(
  data: DataAdapters,
  tenant_id: string,
  opts: ExportOptions,
): Promise<ExportLine[]> {
  const lines: ExportLine[] = [];
  for await (const exportLine of exportTenantLines(data, tenant_id, opts)) {
    lines.push(exportLine);
  }
  return lines;
}
