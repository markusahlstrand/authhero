import {
  Edit,
  SimpleForm,
  TextInput,
  BooleanInput,
  ArrayInput,
  SimpleFormIterator,
  TextArrayInput,
} from "@/components/admin";
import { SecretInput } from "@/common/SecretInput";

export function ClientEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="id" readOnly />
        <TextInput source="name" />
        <SecretInput source="client_secret" />

        <BooleanInput
          source="auth0_conformant"
          label="Auth0 Conformant Mode"
          helperText="Enable Auth0-compatible behavior. Disable for strict OIDC compliance."
          defaultValue={true}
        />
        <BooleanInput
          source="hide_sign_up_disabled_error"
          label="Hide sign-up-disabled error (enumeration-safe)"
        />

        <TextArrayInput source="callbacks" label="Callbacks" />
        <TextArrayInput source="allowed_logout_urls" label="Allowed Logout URLs" />
        <TextArrayInput source="web_origins" label="Web Origins" />
        <TextArrayInput source="allowed_clients" label="Allowed Clients" />

        <ArrayInput source="grant_types" label="Grant Types">
          <SimpleFormIterator inline>
            <TextInput source="" label="" />
          </SimpleFormIterator>
        </ArrayInput>

        <TextInput
          source="addons.samlp.audience"
          label="SAML Audience (Entity ID)"
        />
        <TextInput
          source="addons.samlp.destination"
          label="SAML Destination (ACS URL)"
        />

        <BooleanInput source="oidc_conformant" label="OIDC Conformant" />
        <BooleanInput source="is_first_party" label="First Party Application" />
        <BooleanInput source="sso_disabled" label="SSO Disabled" />
      </SimpleForm>
    </Edit>
  );
}
