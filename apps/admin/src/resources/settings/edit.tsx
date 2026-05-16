import {
  Edit,
  SimpleForm,
  TextInput,
  SelectInput,
  BooleanInput,
  NumberInput,
  ArrayInput,
  SimpleFormIterator,
} from "@/components/admin";

export function SettingsEdit() {
  return (
    <Edit mutationMode="pessimistic" redirect={false}>
      <SimpleForm>
        <TextInput source="friendly_name" label="Friendly Name" />
        <TextInput source="picture_url" label="Picture URL" />
        <TextInput source="support_email" label="Support Email" />
        <TextInput source="support_url" label="Support URL" />
        <TextInput source="default_directory" label="Default Directory" />
        <TextInput source="default_audience" label="Default Audience" />
        <TextInput source="default_organization" label="Default Organization" />
        <TextInput source="default_redirection_uri" label="Default Redirection URI" />

        <NumberInput source="idle_session_lifetime" label="Idle Session Lifetime (s)" />
        <NumberInput source="session_lifetime" label="Session Lifetime (s)" />
        <SelectInput
          source="session_cookie.mode"
          label="Session Cookie Mode"
          choices={[
            { id: "persistent", name: "Persistent" },
            { id: "non-persistent", name: "Non-persistent" },
          ]}
        />

        <BooleanInput
          source="sessions.oidc_logout_prompt_enabled"
          label="OIDC Logout Prompt"
          defaultValue={true}
        />

        <ArrayInput source="enabled_locales" label="Enabled Locales">
          <SimpleFormIterator inline>
            <TextInput source="" label="" />
          </SimpleFormIterator>
        </ArrayInput>

        <TextInput source="error_page.url" label="Error Page URL" />
        <TextInput source="error_page.html" label="Error Page HTML" multiline />
        <BooleanInput source="error_page.show_log_link" label="Error Page: show log link" />

        <BooleanInput source="change_password.enabled" label="Change password enabled" />
        <TextInput source="change_password.html" label="Change password HTML" multiline />

        <BooleanInput source="guardian_mfa_page.enabled" label="Guardian MFA enabled" />
        <TextInput source="guardian_mfa_page.html" label="Guardian MFA HTML" multiline />

        <SelectInput
          source="mfa.policy"
          label="MFA Policy"
          defaultValue="never"
          choices={[
            { id: "never", name: "Never" },
            { id: "all-applications", name: "All applications" },
            { id: "confidence-score", name: "Confidence score" },
          ]}
        />
        <BooleanInput source="mfa.factors.sms" label="MFA: SMS" />
        <BooleanInput source="mfa.factors.otp" label="MFA: OTP" />
        <BooleanInput source="mfa.factors.email" label="MFA: Email" />
        <BooleanInput source="mfa.factors.push_notification" label="MFA: Push notification" />
        <BooleanInput source="mfa.factors.webauthn_roaming" label="MFA: WebAuthn (roaming)" />
        <BooleanInput source="mfa.factors.webauthn_platform" label="MFA: WebAuthn (platform)" />
      </SimpleForm>
    </Edit>
  );
}
