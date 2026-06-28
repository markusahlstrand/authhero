import {
  ProxyRoute,
  ProxyRouteInsert,
  ProxyRouteUpdate,
} from "../types/ProxyRoute";
import { CreateOptions } from "../types/ImportMetadata";

export interface ListProxyRoutesParams {
  page?: number;
  per_page?: number;
  custom_domain_id?: string;
}

export interface ListProxyRoutesResult {
  proxy_routes: ProxyRoute[];
  start: number;
  limit: number;
  length: number;
}

export interface ProxyRoutesAdapter {
  create(
    tenant_id: string,
    route: ProxyRouteInsert,
    options?: CreateOptions,
  ): Promise<ProxyRoute>;
  get(tenant_id: string, id: string): Promise<ProxyRoute | null>;
  list(
    tenant_id: string,
    params?: ListProxyRoutesParams,
  ): Promise<ListProxyRoutesResult>;
  update(
    tenant_id: string,
    id: string,
    route: ProxyRouteUpdate,
  ): Promise<boolean>;
  remove(tenant_id: string, id: string): Promise<boolean>;
}
