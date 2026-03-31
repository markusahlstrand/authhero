import {
  EmailServiceAdapter,
  EmailServiceSendParams,
} from "@authhero/adapter-interfaces";

export class MockEmailService implements EmailServiceAdapter {
  sentEmails: EmailServiceSendParams[] = [];

  send = async (params: EmailServiceSendParams) => {
    this.sentEmails.push(params);
  };

  getSentEmails() {
    return this.sentEmails;
  }
}
