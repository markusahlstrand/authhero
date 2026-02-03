import { EmailProvider } from "../types";

export interface EmailProvidersAdapter {
  update: (
    tenant_id: string,
    emailProvider: Partial<EmailProvider>,
  ) => Promise<void>;
  create: (tenant_id: string, emailProvider: EmailProvider) => Promise<void>;
  get: (tenant_id: string) => Promise<EmailProvider | null>;
  remove: (tenant_id: string) => Promise<void>;
}
