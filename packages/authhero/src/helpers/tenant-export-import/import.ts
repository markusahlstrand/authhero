import {
  DataAdapters,
  ImportMetadata,
  clientInsertSchema,
  connectionInsertSchema,
  resourceServerInsertSchema,
  roleInsertSchema,
  organizationInsertSchema,
  userInsertSchema,
  passwordInsertSchema,
  authenticationMethodInsertSchema,
  userPermissionInsertSchema,
  rolePermissionInsertSchema,
  organizationConnectionInsertSchema,
  userOrganizationInsertSchema,
  clientGrantInsertSchema,
  inviteInsertSchema,
  actionInsertSchema,
  actionVersionInsertSchema,
  hookInsertSchema,
  hookCodeInsertSchema,
  flowInsertSchema,
  formInsertSchema,
  themeInsertSchema,
  brandingSchema,
  promptSettingSchema,
  customTextSchema,
  customTextEntrySchema,
  emailProviderSchema,
  emailTemplateSchema,
  customDomainInsertSchema,
  logStreamInsertSchema,
  migrationSourceInsertSchema,
  proxyRouteInsertSchema,
  tenantInsertSchema,
} from "@authhero/adapter-interfaces";
import {
  ExportLine,
  ImportError,
  ImportOptions,
  ImportResult,
  buildImportMetadata,
} from "./types";
import { EXPORT_ORDER } from "./manifest";
import { asRecord, getString, withoutNullish } from "./row-access";

const ENTITY_ORDER = new Map<string, number>(
  EXPORT_ORDER.map((entity, index) => [entity, index]),
);

/**
 * Build the import-only `options.importMetadata` for a row, preserving its
 * primary id (under `idKey`) and timestamps. Returns `undefined` when none are
 * present so it can be passed straight through as the optional `options` arg.
 */
function meta(
  row: unknown,
  idKey?: string,
): { importMetadata: ImportMetadata } | undefined {
  return buildImportMetadata({
    id: idKey ? getString(row, idKey) : undefined,
    created_at: getString(row, "created_at"),
    updated_at: getString(row, "updated_at"),
  });
}

function required(value: string | undefined, name: string): string {
  if (value === undefined) {
    throw new Error(`Missing required field "${name}"`);
  }
  return value;
}

/**
 * Recreate every row from an export stream under `tenant_id`, in the stream's
 * FK-safe order, preserving ids/timestamps via `importMetadata`. Per-row
 * failures are collected rather than aborting the whole run.
 *
 * The target tenant is created from the `tenants` line only when it does not
 * already exist, and always under `tenant_id` (the source id is overridden) so
 * an export can be loaded into a freshly-provisioned tenant.
 */
export async function importTenant(
  data: DataAdapters,
  tenant_id: string,
  lines: ExportLine[],
  opts: ImportOptions,
): Promise<ImportResult> {
  const counts: Record<string, number> = {};
  const errors: ImportError[] = [];
  const bump = (entity: string) => {
    counts[entity] = (counts[entity] ?? 0) + 1;
  };

  // Don't trust the uploaded line order: a file with child rows before their
  // parents would otherwise fail FK-dependent imports. Re-sort into the
  // FK-safe manifest order (stable, so rows within one entity keep their
  // relative order). Unknown entities sort last and are reported in the loop.
  const orderedLines = [...lines].sort(
    (a, b) =>
      (ENTITY_ORDER.get(a.entity) ?? Number.MAX_SAFE_INTEGER) -
      (ENTITY_ORDER.get(b.entity) ?? Number.MAX_SAFE_INTEGER),
  );

  for (const { entity, data: row } of orderedLines) {
    try {
      // Export rows are full entities; their optional columns are often
      // serialized as null, which the *Insert* schemas reject. Strip nullish
      // top-level fields before validating.
      const clean = withoutNullish(row);
      switch (entity) {
        case "tenants": {
          const parsed = tenantInsertSchema.parse(clean);
          const existing = await data.tenants.get(tenant_id);
          if (existing) continue;
          const params = { ...parsed, id: tenant_id };
          await data.tenants.create(params, meta(row));
          break;
        }
        case "clients":
          await data.clients.create(
            tenant_id,
            clientInsertSchema.parse(clean),
            meta(row, "client_id"),
          );
          break;
        case "connections":
          await data.connections.create(
            tenant_id,
            connectionInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "resource_servers":
          await data.resourceServers.create(
            tenant_id,
            resourceServerInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "roles":
          await data.roles.create(
            tenant_id,
            roleInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "organizations":
          await data.organizations.create(
            tenant_id,
            organizationInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "users":
          await data.users.create(
            tenant_id,
            userInsertSchema.parse(clean),
            meta(row, "user_id"),
          );
          break;
        case "passwords":
          if (!opts.includePasswordHashes) continue;
          await data.passwords.create(
            tenant_id,
            passwordInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "authentication_methods":
          await data.authenticationMethods.create(
            tenant_id,
            authenticationMethodInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "user_roles": {
          const userId = required(getString(row, "user_id"), "user_id");
          const roleId = required(getString(row, "role_id"), "role_id");
          await data.userRoles.create(
            tenant_id,
            userId,
            roleId,
            undefined,
            meta(row),
          );
          break;
        }
        case "user_permissions": {
          const record = asRecord(row);
          const userId = required(getString(row, "user_id"), "user_id");
          const permission = userPermissionInsertSchema.parse(
            withoutNullish(record?.permission),
          );
          await data.userPermissions.create(
            tenant_id,
            userId,
            permission,
            undefined,
            meta(row),
          );
          break;
        }
        case "role_permissions": {
          const record = asRecord(row);
          const roleId = required(getString(row, "role_id"), "role_id");
          const permission = rolePermissionInsertSchema.parse(
            withoutNullish(record?.permission),
          );
          await data.rolePermissions.assign(
            tenant_id,
            roleId,
            [permission],
            meta(row),
          );
          break;
        }
        case "organization_connections": {
          const organizationId = required(
            getString(row, "organization_id"),
            "organization_id",
          );
          await data.organizationConnections.create(
            tenant_id,
            organizationId,
            organizationConnectionInsertSchema.parse(clean),
            meta(row),
          );
          break;
        }
        case "user_organizations":
          await data.userOrganizations.create(
            tenant_id,
            userOrganizationInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "client_grants":
          await data.clientGrants.create(
            tenant_id,
            clientGrantInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "invites":
          await data.invites.create(
            tenant_id,
            inviteInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "actions":
          await data.actions.create(
            tenant_id,
            actionInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "action_versions":
          await data.actionVersions.create(
            tenant_id,
            actionVersionInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "hooks":
          await data.hooks.create(
            tenant_id,
            hookInsertSchema.parse(clean),
            meta(row, "hook_id"),
          );
          break;
        case "hook_code":
          await data.hookCode.create(
            tenant_id,
            hookCodeInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "flows":
          await data.flows.create(
            tenant_id,
            flowInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "forms":
          await data.forms.create(
            tenant_id,
            formInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "themes": {
          const themeId = getString(row, "themeId");
          await data.themes.create(
            tenant_id,
            themeInsertSchema.parse(clean),
            themeId,
            meta(row, "themeId"),
          );
          break;
        }
        case "branding":
          await data.branding.set(tenant_id, brandingSchema.parse(clean));
          break;
        case "prompt_settings":
          await data.promptSettings.set(
            tenant_id,
            promptSettingSchema.parse(clean),
          );
          break;
        case "universal_login_templates": {
          const body = required(getString(row, "body"), "body");
          await data.universalLoginTemplates.set(
            tenant_id,
            { body },
            meta(row),
          );
          break;
        }
        case "custom_text": {
          const record = asRecord(row);
          const entry = customTextEntrySchema.parse({
            prompt: getString(row, "prompt"),
            language: getString(row, "language"),
          });
          const customText = customTextSchema.parse(
            withoutNullish(record?.custom_text),
          );
          await data.customText.set(
            tenant_id,
            entry.prompt,
            entry.language,
            customText,
            meta(row),
          );
          break;
        }
        case "email_providers":
          await data.emailProviders.create(
            tenant_id,
            emailProviderSchema.parse(clean),
            meta(row),
          );
          break;
        case "email_templates":
          await data.emailTemplates.create(
            tenant_id,
            emailTemplateSchema.parse(clean),
            meta(row),
          );
          break;
        case "custom_domains":
          await data.customDomains.create(
            tenant_id,
            customDomainInsertSchema.parse(clean),
            meta(row, "custom_domain_id"),
          );
          break;
        case "log_streams":
          if (!data.logStreams) {
            errors.push({
              entity,
              error: "logStreams adapter is not configured",
            });
            continue;
          }
          await data.logStreams.create(
            tenant_id,
            logStreamInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "migration_sources":
          if (!data.migrationSources) {
            errors.push({
              entity,
              error: "migrationSources adapter is not configured",
            });
            continue;
          }
          await data.migrationSources.create(
            tenant_id,
            migrationSourceInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        case "proxy_routes":
          if (!data.proxyRoutes) {
            errors.push({
              entity,
              error: "proxyRoutes adapter is not configured",
            });
            continue;
          }
          await data.proxyRoutes.create(
            tenant_id,
            proxyRouteInsertSchema.parse(clean),
            meta(row, "id"),
          );
          break;
        default:
          // Unknown entity in the stream — record it so a partial import is
          // never mistaken for a clean one.
          errors.push({ entity, error: `Unknown entity "${entity}"` });
          continue;
      }
      bump(entity);
    } catch (err) {
      errors.push({
        entity,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { counts, errors };
}
