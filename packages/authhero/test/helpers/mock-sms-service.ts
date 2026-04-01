import {
  SmsServiceAdapter,
  SmsServiceSendParams,
} from "@authhero/adapter-interfaces";

export class MockSmsService implements SmsServiceAdapter {
  sentSms: SmsServiceSendParams[] = [];

  send = async (params: SmsServiceSendParams) => {
    this.sentSms.push(params);
  };

  getSentSms() {
    return this.sentSms;
  }
}
