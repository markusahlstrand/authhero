import { CreateOptions } from "../types/ImportMetadata";

export interface UniversalLoginTemplate {
  body: string;
}

export interface UniversalLoginTemplatesAdapter {
  get: (tenant_id: string) => Promise<UniversalLoginTemplate | null>;
  set: (
    tenant_id: string,
    template: UniversalLoginTemplate,
    options?: CreateOptions,
  ) => Promise<void>;
  delete: (tenant_id: string) => Promise<void>;
}
