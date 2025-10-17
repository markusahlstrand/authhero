import { Tenant, Totals } from "../types";
import { ListParams } from "../types/ListParams";

export interface CreateTenantParams {
  friendly_name: string;
  audience: string;
  sender_name: string;
  sender_email: string;
  id?: string;
}

export interface TenantsDataAdapter {
  create(params: CreateTenantParams): Promise<Tenant>;
  get(id: string): Promise<Tenant | null>;
  list(params?: ListParams): Promise<{ tenants: Tenant[]; totals?: Totals }>;
  update(id: string, tenant: Partial<Tenant>): Promise<void>;
  remove(tenantId: string): Promise<boolean>;
}
