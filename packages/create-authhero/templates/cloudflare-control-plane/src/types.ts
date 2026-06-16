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
}
