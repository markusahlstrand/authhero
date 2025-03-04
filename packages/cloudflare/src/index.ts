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
