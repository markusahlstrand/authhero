import { Branding } from "../types";

export interface BrandingAdapter {
  set: (tenant_id: string, authCode: Branding) => Promise<void>;
  get: (tenant_id: string) => Promise<Branding | null>;
}
