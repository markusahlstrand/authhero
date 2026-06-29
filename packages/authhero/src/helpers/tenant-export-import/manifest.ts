/**
 * FK-safe import order: parents are listed before their children so a
 * sequential importer can always satisfy foreign keys. The exporter emits
 * lines in this same order.
 *
 * Excluded entirely (never exported or imported):
 *   - keys — global signing-key pool; the target generates its own.
 *   - ephemeral / audit: sessions, refresh_tokens, codes, login_sessions,
 *     logs, action_executions, outbox_events, grants.
 */
export const EXPORT_ORDER = [
  "tenants",
  "clients",
  "connections",
  "resource_servers",
  "roles",
  "organizations",
  "users",
  "passwords",
  "authentication_methods",
  "user_roles",
  "user_permissions",
  "role_permissions",
  "organization_connections",
  "user_organizations",
  "client_grants",
  "invites",
  "actions",
  "action_versions",
  "hook_code",
  "hooks",
  "flows",
  "forms",
  "themes",
  "branding",
  "prompt_settings",
  "universal_login_templates",
  "custom_text",
  "email_providers",
  "email_templates",
  "custom_domains",
  "log_streams",
  "migration_sources",
  "proxy_routes",
] as const;

export type ExportEntity = (typeof EXPORT_ORDER)[number];
