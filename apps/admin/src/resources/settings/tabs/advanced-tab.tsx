import {
  ArrayInput,
  BooleanInput,
  SimpleFormIterator,
  TextInput,
} from "@/components/admin";

export function AdvancedTab() {
  return (
    <div className="flex flex-col gap-3">
      <BooleanInput
        source="oidc_logout.rp_logout_end_session_endpoint_discovery"
        label="RP-Initiated Logout End Session Endpoint Discovery"
        helperText="Advertise end_session_endpoint in /.well-known/openid-configuration. Required for RP-Initiated Logout (OpenID Connect Session Management). Off by default."
        defaultValue={false}
      />
      <TextInput source="sandbox_version" label="Sandbox Version" />
      <ArrayInput
        source="sandbox_versions_available"
        label="Available Sandbox Versions"
      >
        <SimpleFormIterator inline>
          <TextInput source="" label="" />
        </SimpleFormIterator>
      </ArrayInput>
    </div>
  );
}
