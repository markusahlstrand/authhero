import type { CreateServiceTokenFn } from "./EmailService";

export interface SmsServiceSendParams {
  to: string;
  from?: string;
  text: string;
  template: string;
  options: Record<string, unknown>;
  data: Record<string, string>;
  createServiceToken?: CreateServiceTokenFn;
}

export interface SmsServiceAdapter {
  send(params: SmsServiceSendParams): Promise<void>;
}
