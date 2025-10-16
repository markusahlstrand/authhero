import { TenantSettings } from "../types";

export interface TenantSettingsAdapter {
  set: (tenant_id: string, settings: TenantSettings) => Promise<void>;
  get: (tenant_id: string) => Promise<TenantSettings | null>;
}
