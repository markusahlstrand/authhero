import { Branding } from "../types";

export interface UniversalLoginTemplate {
  body: string;
}

export interface BrandingAdapter {
  set: (tenant_id: string, authCode: Branding) => Promise<void>;
  get: (tenant_id: string) => Promise<Branding | null>;
  setUniversalLoginTemplate: (
    tenant_id: string,
    template: UniversalLoginTemplate,
  ) => Promise<void>;
  getUniversalLoginTemplate: (
    tenant_id: string,
  ) => Promise<UniversalLoginTemplate | null>;
  deleteUniversalLoginTemplate: (tenant_id: string) => Promise<void>;
}
