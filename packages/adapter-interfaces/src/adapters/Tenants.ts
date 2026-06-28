import { Tenant, Totals } from "../types";
import { ListParams } from "../types/ListParams";
import { CreateOptions } from "../types/ImportMetadata";

export interface CreateTenantParams {
  friendly_name: string;
  audience?: string;
  sender_name?: string;
  sender_email?: string;
  id?: string;
  session_lifetime?: number;
  idle_session_lifetime?: number;

  // Deployment / provisioning. See `Tenant` for field semantics; included here
  // so the adapter can write the initial row atomically when a wfp tenant is
  // created.
  deployment_type?: "shared" | "wfp";
  provisioning_state?: "pending" | "ready" | "failed";
  provisioning_error?: string;
  provisioning_state_changed_at?: string;
  bundle_configuration?: string;
  worker_version?: string;
  database_version?: string;
  worker_script_name?: string;
  storage_kind?: "own_d1" | "existing_d1" | "shared_planetscale";
  d1_database_id?: string;
}

export interface TenantsDataAdapter {
  create(
    params: CreateTenantParams,
    options?: CreateOptions,
  ): Promise<Tenant>;
  get(id: string): Promise<Tenant | null>;
  list(params?: ListParams): Promise<{ tenants: Tenant[]; totals?: Totals }>;
  update(id: string, tenant: Partial<Tenant>): Promise<void>;
  remove(tenantId: string): Promise<boolean>;
}
