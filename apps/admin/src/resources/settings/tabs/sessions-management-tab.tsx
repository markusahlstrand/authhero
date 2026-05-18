import { BooleanInput } from "@/components/admin";

export function SessionsManagementTab() {
  return (
    <BooleanInput
      source="sessions.oidc_logout_prompt_enabled"
      label="RP-Initiated Logout End-User Confirmation"
      helperText="Show an interstitial 'Are you sure you want to log out?' page when an RP redirects to end_session_endpoint. When off, users are logged out without confirmation. On by default."
      defaultValue={true}
    />
  );
}
