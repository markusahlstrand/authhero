export interface UniversalLoginTemplate {
  body: string;
}

export interface UniversalLoginTemplatesAdapter {
  get: (tenant_id: string) => Promise<UniversalLoginTemplate | null>;
  set: (tenant_id: string, template: UniversalLoginTemplate) => Promise<void>;
  delete: (tenant_id: string) => Promise<void>;
}
