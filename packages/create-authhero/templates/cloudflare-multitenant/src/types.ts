/// <reference types="@cloudflare/workers-types" />

import { AnalyticsEngineDataset } from "@authhero/cloudflare-adapter";

export interface Env {
  // Main D1 database for tenant registry and main tenant data
  MAIN_DB: D1Database;

  // Analytics Engine for logs
  AUTH_LOGS: AnalyticsEngineDataset;

  // Cloudflare API credentials for dynamic D1 database management
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;

  // Optional: Analytics Engine API token (may be different from main API token)
  ANALYTICS_ENGINE_API_TOKEN?: string;

  // Base domain for subdomain routing (e.g., "auth.example.com")
  BASE_DOMAIN?: string;

  // Main tenant ID
  MAIN_TENANT_ID: string;
}
