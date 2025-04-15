import { SendSMSParams } from "../../src/types/SMSService";

export class MockSmsService {
  sentSms: SendSMSParams[] = [];

  async sendSms(params: SendSMSParams) {
    this.sentSms.push(params);
    return {};
  }

  getSentSms() {
    return this.sentSms;
  }
}