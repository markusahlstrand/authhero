import { EmailProvider } from "@authhero/adapter-interfaces";

export type SendEmailParams = {
  emailProvider: EmailProvider;
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  template: string;
  data: Record<string, string>;
};
export type SendEmailResponse = {};

export type EmailService = (
  param: SendEmailParams,
) => Promise<SendEmailResponse>;
