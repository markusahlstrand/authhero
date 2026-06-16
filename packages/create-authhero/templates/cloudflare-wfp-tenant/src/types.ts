/// <reference types="@cloudflare/workers-types" />

export interface Env {
  // This tenant's own D1 database. Each WFP tenant Worker has its own.
  AUTH_DB: D1Database;

  // Base64-encoded 32-byte key for this tenant's own secrets at rest.
  // `wrangler secret put ENCRYPTION_KEY` (per tenant Worker).
  ENCRYPTION_KEY?: string;

  // Base64-encoded 32-byte CONTROL PLANE key. Decrypts the shared secrets
  // (e.g. Google client_secret) that the control plane projected into this
  // tenant's database under the "cp" key id. The Worker holds it as a binding;
  // a raw export of AUTH_DB cannot be decrypted without it.
  CONTROL_PLANE_ENCRYPTION_KEY?: string;
}
