import { CustomDomainsAdapter } from "@authhero/adapter-interfaces";
import { createCustomDomainsAdapter } from "./customDomains";
import { CloudflareConfig } from "./types/CloudflareConfig";

export default function createAdapters(config: CloudflareConfig): {
  customDomains: CustomDomainsAdapter;
} {
  return {
    customDomains: createCustomDomainsAdapter(config),
  };
}

// Export cache adapter creators separately since they have different config requirements
export { createCloudflareCache, createGlobalCloudflareCache } from "./cache";
export type { CloudflareCacheConfig } from "./cache";
