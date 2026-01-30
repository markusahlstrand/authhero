import { Branding } from "../types";

export interface BrandingAdapter {
  set: (tenant_id: string, authCode: Branding) => Promise<void>;
  get: (tenant_id: string) => Promise<Branding | null>;
  // Universal Login Template methods
  setUniversalLoginTemplate: (tenant_id: string, template: string) => Promise<void>;
  getUniversalLoginTemplate: (tenant_id: string) => Promise<string | null>;
  deleteUniversalLoginTemplate: (tenant_id: string) => Promise<void>;
}
