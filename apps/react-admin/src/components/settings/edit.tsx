import {
  Edit,
  TextInput,
  TabbedForm,
  BooleanInput,
  NumberInput,
  ArrayInput,
  SimpleFormIterator,
} from "react-admin";
import { Stack } from "@mui/material";

export function SettingsEdit() {
  return (
    <Edit>
      <TabbedForm>
        <TabbedForm.Tab label="General">
          <Stack spacing={2}>
            <TextInput source="friendly_name" label="Friendly Name" fullWidth />
            <TextInput source="picture_url" label="Picture URL" fullWidth />
            <TextInput source="support_email" label="Support Email" fullWidth />
            <TextInput source="support_url" label="Support URL" fullWidth />
            <TextInput
              source="default_directory"
              label="Default Directory"
              fullWidth
            />
            <TextInput
              source="default_audience"
              label="Default Audience"
              fullWidth
            />
            <TextInput
              source="default_organization"
              label="Default Organization"
              fullWidth
            />
            <TextInput
              source="default_redirection_uri"
              label="Default Redirection URI"
              fullWidth
            />
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Session">
          <Stack spacing={2}>
            <NumberInput
              source="idle_session_lifetime"
              label="Idle Session Lifetime (hours)"
              helperText="Hours before an idle session expires"
            />
            <NumberInput
              source="session_lifetime"
              label="Session Lifetime (hours)"
              helperText="Maximum session duration in hours"
            />
            <TextInput
              source="session_cookie.mode"
              label="Session Cookie Mode"
              helperText="persistent or non-persistent"
            />
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Sessions Management">
          <BooleanInput
            source="sessions.oidc_logout_prompt_enabled"
            label="Enable OIDC Logout Prompt"
          />
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Localization">
          <ArrayInput source="enabled_locales" label="Enabled Locales">
            <SimpleFormIterator inline>
              <TextInput source="" label="" helperText="e.g., en, es, fr" />
            </SimpleFormIterator>
          </ArrayInput>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Error Page">
          <Stack spacing={2}>
            <TextInput
              source="error_page.url"
              label="Error Page URL"
              fullWidth
            />
            <TextInput
              source="error_page.html"
              label="Error Page HTML"
              multiline
              rows={10}
              fullWidth
            />
            <BooleanInput
              source="error_page.show_log_link"
              label="Show Log Link"
            />
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Change Password">
          <Stack spacing={2}>
            <BooleanInput source="change_password.enabled" label="Enabled" />
            <TextInput
              source="change_password.html"
              label="Custom HTML"
              multiline
              rows={10}
              fullWidth
            />
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Guardian MFA">
          <Stack spacing={2}>
            <BooleanInput source="guardian_mfa_page.enabled" label="Enabled" />
            <TextInput
              source="guardian_mfa_page.html"
              label="Custom HTML"
              multiline
              rows={10}
              fullWidth
            />
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Feature Flags">
          <Stack spacing={2}>
            <BooleanInput
              source="flags.allow_legacy_delegation_grant_types"
              label="Allow Legacy Delegation Grant Types"
            />
            <BooleanInput
              source="flags.allow_legacy_ro_grant_types"
              label="Allow Legacy RO Grant Types"
            />
            <BooleanInput
              source="flags.allow_legacy_tokeninfo_endpoint"
              label="Allow Legacy Token Info Endpoint"
            />
            <BooleanInput
              source="flags.disable_clickjack_protection_headers"
              label="Disable Clickjack Protection Headers"
            />
            <BooleanInput
              source="flags.enable_apis_section"
              label="Enable APIs Section"
            />
            <BooleanInput
              source="flags.enable_client_connections"
              label="Enable Client Connections"
            />
            <BooleanInput
              source="flags.enable_custom_domain_in_emails"
              label="Enable Custom Domain in Emails"
            />
            <BooleanInput
              source="flags.enable_dynamic_client_registration"
              label="Enable Dynamic Client Registration"
            />
            <BooleanInput
              source="flags.enable_idtoken_api2"
              label="Enable ID Token API v2"
            />
            <BooleanInput
              source="flags.enable_legacy_logs_search_v2"
              label="Enable Legacy Logs Search v2"
            />
            <BooleanInput
              source="flags.enable_legacy_profile"
              label="Enable Legacy Profile"
            />
            <BooleanInput
              source="flags.enable_pipeline2"
              label="Enable Pipeline 2"
            />
            <BooleanInput
              source="flags.enable_public_signup_user_exists_error"
              label="Enable Public Signup User Exists Error"
            />
            <BooleanInput
              source="flags.use_scope_descriptions_for_consent"
              label="Use Scope Descriptions for Consent"
            />
            <BooleanInput
              source="flags.disable_management_api_sms_obfuscation"
              label="Disable Management API SMS Obfuscation"
            />
            <BooleanInput
              source="flags.enable_adfs_waad_email_verification"
              label="Enable ADFS WAAD Email Verification"
            />
            <BooleanInput
              source="flags.revoke_refresh_token_grant"
              label="Revoke Refresh Token Grant"
            />
            <BooleanInput
              source="flags.dashboard_log_streams_next"
              label="Dashboard Log Streams Next"
            />
            <BooleanInput
              source="flags.dashboard_insights_view"
              label="Dashboard Insights View"
            />
            <BooleanInput
              source="flags.disable_fields_map_fix"
              label="Disable Fields Map Fix"
            />
            <BooleanInput
              source="flags.mfa_show_factor_list_on_enrollment"
              label="MFA Show Factor List on Enrollment"
            />
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Advanced">
          <Stack spacing={2}>
            <TextInput
              source="sandbox_version"
              label="Sandbox Version"
              fullWidth
            />
            <ArrayInput
              source="sandbox_versions_available"
              label="Available Sandbox Versions"
            >
              <SimpleFormIterator inline>
                <TextInput source="" label="" />
              </SimpleFormIterator>
            </ArrayInput>
            <BooleanInput
              source="enable_client_connections"
              label="Enable Client Connections"
            />
          </Stack>
        </TabbedForm.Tab>
      </TabbedForm>
    </Edit>
  );
}
