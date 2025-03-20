import { CustomDomainsAdapter } from "@authhero/adapter-interfaces";

export interface CloudflareConfig {
  zoneId: string;
  authKey: string;
  authEmail: string;
  enterprise?: boolean;
  customDomainAdapter: CustomDomainsAdapter;
}
