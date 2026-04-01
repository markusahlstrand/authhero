export interface SmsServiceSendParams {
  to: string;
  from?: string;
  text: string;
  template: string;
  options: Record<string, unknown>;
  data: Record<string, string>;
}

export interface SmsServiceAdapter {
  send(params: SmsServiceSendParams): Promise<void>;
}
