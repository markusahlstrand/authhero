import { EmailProvider } from "../types";
import { CreateOptions } from "../types/ImportMetadata";

export interface EmailProvidersAdapter {
  update: (
    tenant_id: string,
    emailProvider: Partial<EmailProvider>,
  ) => Promise<void>;
  create: (
    tenant_id: string,
    emailProvider: EmailProvider,
    options?: CreateOptions,
  ) => Promise<void>;
  get: (tenant_id: string) => Promise<EmailProvider | null>;
  remove: (tenant_id: string) => Promise<void>;
}
