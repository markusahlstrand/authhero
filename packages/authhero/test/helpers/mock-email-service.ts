import { SendEmailParams } from "../../src/types/EmailService";

export class MockEmailService {
  sentEmails: SendEmailParams[] = [];

  async sendEmail(params: SendEmailParams) {
    this.sentEmails.push(params);
    return {};
  }

  getSentEmails() {
    return this.sentEmails;
  }
}
