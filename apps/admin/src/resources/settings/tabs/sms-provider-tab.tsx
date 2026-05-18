import { TextInput } from "@/components/admin";
import { SecretInput } from "@/common/SecretInput";

export function SmsProviderTab() {
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        source="mfa.sms_provider.provider"
        label="Provider"
        helperText="twilio, vonage, aws_sns, or phone_message_hook"
      />
      <TextInput source="mfa.twilio.sid" label="Twilio Account SID" />
      <SecretInput source="mfa.twilio.auth_token" label="Twilio Auth Token" />
      <TextInput
        source="mfa.twilio.from"
        label="Twilio From Number"
        helperText="E.164 format, e.g., +15551234567"
      />
      <TextInput
        source="mfa.twilio.messaging_service_sid"
        label="Twilio Messaging Service SID"
      />
    </div>
  );
}
