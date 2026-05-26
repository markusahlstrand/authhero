import { EmailProvider } from "../types";

export interface CreateServiceTokenParams {
  clientId: string;
  scope: string;
  audience?: string;
  expiresInSeconds?: number;
  customClaims?: Record<string, unknown>;
}

export type CreateServiceTokenFn = (
  params: CreateServiceTokenParams,
) => Promise<string>;

export interface EmailServiceSendParams {
  emailProvider: EmailProvider;
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  template: string;
  data: Record<string, string>;
  createServiceToken?: CreateServiceTokenFn;
}

export interface EmailServiceAdapter {
  send(params: EmailServiceSendParams): Promise<void>;
}
