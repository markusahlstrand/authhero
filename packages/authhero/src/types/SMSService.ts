export type SendSMSParams = {
  to: string;
  from?: string;
  text: string;
  template: string;
  options: any;
  data: Record<string, string>;
};
export type SendSMSResponse = {};

export type smsService = (param: SendSMSParams) => Promise<SendSMSResponse>;
