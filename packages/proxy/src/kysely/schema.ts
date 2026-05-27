import { Generated } from "kysely";

export interface ProxyRoutesTable {
  id: string;
  tenant_id: string;
  custom_domain_id: string;
  priority: number;
  path_pattern: string;
  upstream_type: "http" | "authhero" | "redirect";
  upstream_url: string;
  preserve_host: number;
  middleware: string;
  created_at: string;
  updated_at: string;
}

export interface CustomDomainsLookupTable {
  custom_domain_id: string;
  tenant_id: string;
  domain: string;
}

export interface ProxyDatabase {
  proxy_routes: ProxyRoutesTable;
  custom_domains: CustomDomainsLookupTable;
}

export type ProxyRouteRow = {
  [K in keyof ProxyRoutesTable]: ProxyRoutesTable[K] extends Generated<infer T>
    ? T
    : ProxyRoutesTable[K];
};
