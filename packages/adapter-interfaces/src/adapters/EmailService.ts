import { EmailProvider } from "../types";

export interface EmailServiceSendParams {
  emailProvider: EmailProvider;
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  template: string;
  data: Record<string, string>;
}

export interface EmailServiceAdapter {
  send(params: EmailServiceSendParams): Promise<void>;
}
