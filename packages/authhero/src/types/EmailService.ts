export type SendEmailParams = {
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
};
export type SendEmailResponse = {};

export type EmailService = (
  param: SendEmailParams,
) => Promise<SendEmailResponse>;
