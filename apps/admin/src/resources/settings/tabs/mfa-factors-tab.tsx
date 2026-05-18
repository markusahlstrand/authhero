import { BooleanInput, SelectInput } from "@/components/admin";

export function MfaFactorsTab() {
  return (
    <div className="flex flex-col gap-3">
      <SelectInput
        source="mfa.policy"
        label="MFA Policy"
        choices={[
          { id: "never", name: "Never" },
          { id: "always", name: "Always (require for all logins)" },
        ]}
        defaultValue="never"
        helperText="Controls when users are required to use multi-factor authentication"
      />
      <BooleanInput source="mfa.factors.sms" label="SMS" />
      <BooleanInput source="mfa.factors.otp" label="One-Time Password (OTP)" />
      <BooleanInput source="mfa.factors.email" label="Email" />
      <BooleanInput
        source="mfa.factors.push_notification"
        label="Push Notification"
      />
      <BooleanInput
        source="mfa.factors.webauthn_roaming"
        label="WebAuthn (Roaming)"
      />
      <BooleanInput
        source="mfa.factors.webauthn_platform"
        label="WebAuthn (Platform)"
      />
      <BooleanInput source="mfa.factors.recovery_code" label="Recovery Code" />
      <BooleanInput source="mfa.factors.duo" label="Duo" />
    </div>
  );
}
