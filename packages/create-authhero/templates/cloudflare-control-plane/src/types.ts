/// <reference types="@cloudflare/workers-types" />

export interface Env {
  // The control plane's shared database (also home to colocated tenants).
  AUTH_DB: D1Database;

  // Base64-encoded 32-byte key for the control plane's own secrets at rest.
  ENCRYPTION_KEY?: string;

  // Base64-encoded 32-byte key (key id "cp") that shared secrets are encrypted
  // under when projected into a tenant's database. The control plane holds it
  // so the rollout can re-encrypt secrets the tenant Worker will decrypt.
  CONTROL_PLANE_ENCRYPTION_KEY?: string;

  // Cloudflare for SaaS credentials for the zone that fronts every tenant's
  // custom domains. They live here and nowhere else: registering a custom
  // hostname is an account-level operation, so tenant Workers delegate it to
  // this Worker. Without all three, the /custom-domains resource is not
  // mounted and tenants cannot register domains.
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_API_KEY?: string;
  CLOUDFLARE_API_EMAIL?: string;
  // Set to "true" on an Enterprise zone. Enterprise zones can stamp the owning
  // tenant onto each custom hostname, which is what lets the adapter tell "this
  // hostname is ours to adopt" from "this one belongs to somebody else". Left
  // unset, every ownership check falls back to the hostname being unique across
  // the zone, which is true but cannot detect drift.
  CLOUDFLARE_ZONE_ENTERPRISE?: string;
}
