import { Application, ApplicationInsert, Totals } from "../types";
import { ListParams } from "../types/ListParams";

export interface ApplicationsAdapter {
  create(tenant_id: string, params: ApplicationInsert): Promise<Application>;
  get(tenant_id: string, id: string): Promise<Application | null>;
  remove(tenant_id: string, id: string): Promise<boolean>;
  list(
    tenant_id: string,
    params: ListParams,
  ): Promise<{ applications: Application[]; totals?: Totals }>;
  update(
    tenant_id: string,
    id: string,
    application: Partial<Application>,
  ): Promise<boolean>;
}
