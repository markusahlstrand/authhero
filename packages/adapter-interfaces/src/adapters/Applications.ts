import { Application, Totals } from "../types";
import { ListParams } from "../types/ListParams";

export interface CreateApplicationParams {
  name: string;
  allowed_web_origins: string;
  allowed_callback_urls: string;
  allowed_logout_urls: string;
  email_validation: "enabled" | "disabled" | "enforced";
  client_secret: string;
  id: string;
  disable_sign_ups: boolean;
  addons?: Record<string, Record<string, string | number>>;
}

export interface ApplicationsAdapter {
  create(
    tenant_id: string,
    params: CreateApplicationParams,
  ): Promise<Application>;
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
