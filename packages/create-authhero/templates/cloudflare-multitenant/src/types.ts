/// <reference types="@cloudflare/workers-types" />

// Uncomment to enable Analytics Engine logging:
// import { AnalyticsEngineDataset } from "@authhero/cloudflare-adapter";

export interface Env {
  // D1 database for all tenant data
  AUTH_DB: D1Database;

  // ──────────────────────────────────────────────────────────────────────────
  // OPTIONAL: Analytics Engine for centralized logging
  // Uncomment to enable:
  // ──────────────────────────────────────────────────────────────────────────
  // AUTH_LOGS: AnalyticsEngineDataset;
  // CLOUDFLARE_ACCOUNT_ID: string;
  // CLOUDFLARE_API_TOKEN: string;
  // ANALYTICS_ENGINE_API_TOKEN?: string; // Optional: separate token for Analytics Engine

  // ──────────────────────────────────────────────────────────────────────────
  // OPTIONAL: Rate Limiting
  // Uncomment to enable:
  // ──────────────────────────────────────────────────────────────────────────
  // RATE_LIMITER: RateLimiter;
}
