/// <reference types="@cloudflare/workers-types" />

// Uncomment to enable Analytics Engine logging:
// import { AnalyticsEngineDataset } from "@authhero/cloudflare-adapter";

export interface Env {
  AUTH_DB: D1Database;

  // Base64-encoded 32-byte key for at-rest encryption of sensitive credential
  // fields. Set in .dev.vars locally and via `wrangler secret put ENCRYPTION_KEY`
  // in production. Optional — encryption is skipped when unset.
  ENCRYPTION_KEY?: string;

  // ──────────────────────────────────────────────────────────────────────────
  // OPTIONAL: Analytics Engine for centralized logging
  // Uncomment to enable:
  // ──────────────────────────────────────────────────────────────────────────
  // AUTH_LOGS: AnalyticsEngineDataset;
  // AUTH_ACTION_EXECUTIONS: AnalyticsEngineDataset; // Optional: separate dataset for action executions
  // CLOUDFLARE_ACCOUNT_ID: string;
  // CLOUDFLARE_API_TOKEN: string;
  // ANALYTICS_ENGINE_API_TOKEN?: string; // Optional: separate token for Analytics Engine

  // ──────────────────────────────────────────────────────────────────────────
  // OPTIONAL: Rate Limiting
  // Uncomment to enable:
  // ──────────────────────────────────────────────────────────────────────────
  // RATE_LIMITER: RateLimiter;
}
