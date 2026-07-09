import { useWatch } from "react-hook-form";
import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  BooleanInput,
} from "@/components/admin";
import { SecretInput } from "@/common/SecretInput";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlTabs } from "@/components/ui/url-tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RawJsonTab } from "@/common/RawJsonTab";

function FactorRow({ source, label }: { source: string; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <BooleanInput source={source} label="" />
    </div>
  );
}

function FactorsTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>MFA policy and factors</CardTitle>
        <CardDescription>
          Choose when MFA is required and which factors users may enroll.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SelectInput
          source="mfa.policy"
          label="MFA policy"
          choices={[
            { id: "never", name: "Never" },
            { id: "always", name: "Always (required for all logins)" },
          ]}
          defaultValue="never"
          helperText="Controls when users are prompted for multi-factor authentication."
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <FactorRow source="mfa.factors.otp" label="One-time password (OTP)" />
          <FactorRow source="mfa.factors.sms" label="SMS" />
          <FactorRow source="mfa.factors.email" label="Email" />
          <FactorRow
            source="mfa.factors.push_notification"
            label="Push notification"
          />
          <FactorRow
            source="mfa.factors.webauthn_roaming"
            label="WebAuthn (roaming)"
          />
          <FactorRow
            source="mfa.factors.webauthn_platform"
            label="WebAuthn (platform)"
          />
          <FactorRow source="mfa.factors.recovery_code" label="Recovery code" />
          <FactorRow source="mfa.factors.duo" label="Duo" />
        </div>
      </CardContent>
    </Card>
  );
}

function SmsProviderTab() {
  const provider = useWatch({ name: "mfa.sms_provider.provider" }) as
    | string
    | undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle>SMS provider</CardTitle>
        <CardDescription>
          Configure the provider used to deliver SMS factor codes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SelectInput
          source="mfa.sms_provider.provider"
          label="Provider"
          choices={[
            { id: "twilio", name: "Twilio" },
            { id: "vonage", name: "Vonage" },
            { id: "aws_sns", name: "AWS SNS" },
            { id: "phone_message_hook", name: "Custom hook" },
          ]}
        />
        {provider === "twilio" || !provider ? (
          <div className="flex flex-col gap-3 rounded-md border p-3">
            <div className="text-sm font-medium">Twilio</div>
            <TextInput source="mfa.twilio.sid" label="Account SID" />
            <SecretInput source="mfa.twilio.auth_token" label="Auth token" />
            <TextInput
              source="mfa.twilio.from"
              label="From number"
              helperText="E.164 format, e.g. +15551234567"
            />
            <TextInput
              source="mfa.twilio.messaging_service_sid"
              label="Messaging service SID"
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function GuardianPageTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Guardian MFA page</CardTitle>
        <CardDescription>
          Optional custom HTML for the hosted Guardian MFA enrollment screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <BooleanInput
          source="guardian_mfa_page.enabled"
          label="Use custom page"
        />
        <TextInput
          source="guardian_mfa_page.html"
          label="Custom HTML"
          multiline
        />
      </CardContent>
    </Card>
  );
}

export function MfaEdit() {
  return (
    <Edit mutationMode="pessimistic" redirect={false}>
      <SimpleForm className="max-w-none">
        <UrlTabs defaultValue="factors" className="w-full">
          <TabsList>
            <TabsTrigger value="factors">Factors &amp; policy</TabsTrigger>
            <TabsTrigger value="sms">SMS provider</TabsTrigger>
            <TabsTrigger value="page">Guardian page</TabsTrigger>
            <TabsTrigger value="raw">Raw JSON</TabsTrigger>
          </TabsList>
          <TabsContent value="factors" className="mt-4">
            <FactorsTab />
          </TabsContent>
          <TabsContent value="sms" className="mt-4">
            <SmsProviderTab />
          </TabsContent>
          <TabsContent value="page" className="mt-4">
            <GuardianPageTab />
          </TabsContent>
          <TabsContent value="raw" className="mt-4">
            <RawJsonTab />
          </TabsContent>
        </UrlTabs>
      </SimpleForm>
    </Edit>
  );
}
