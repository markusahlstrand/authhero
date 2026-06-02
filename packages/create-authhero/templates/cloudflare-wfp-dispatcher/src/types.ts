/// <reference types="@cloudflare/workers-types" />

export interface Env {
  // The shared platform D1 database. Holds custom_domains (host -> tenant)
  // and proxy_routes (optional per-host route overrides).
  AUTH_DB: D1Database;

  // The Cloudflare Workers for Platforms dispatch namespace where each
  // tenant's auth worker is deployed. Wrangler binding configured in
  // wrangler.toml as `[[dispatch_namespaces]] binding = "DISPATCHER"`.
  DISPATCHER: DispatchNamespace;

  // Optional template for resolving a tenant to a dispatch namespace
  // script name. Defaults to `tenant-{tenant_id}-auth`. Supported
  // placeholders: {tenant_id}, {custom_domain_id}, {domain}, {host}.
  SCRIPT_NAME_TEMPLATE?: string;
}
