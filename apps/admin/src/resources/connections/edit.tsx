import {
  Edit,
  SimpleForm,
  TextInput,
  BooleanInput,
  SelectInput,
} from "@/components/admin";
import { SecretInput } from "@/common/SecretInput";

export function ConnectionEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="id" readOnly />
        <TextInput source="name" />
        <SelectInput
          source="strategy"
          choices={[
            { id: "email", name: "Email" },
            { id: "google-oauth2", name: "Google" },
            { id: "facebook", name: "Facebook" },
            { id: "apple", name: "Apple" },
            { id: "github", name: "GitHub" },
            { id: "windowslive", name: "Microsoft" },
            { id: "vipps", name: "Vipps" },
            { id: "oauth2", name: "OAuth2" },
            { id: "oidc", name: "OpenID Connect" },
            { id: "auth2", name: "Password" },
            { id: "sms", name: "SMS" },
            { id: "samlp", name: "SAML" },
          ]}
        />
        <TextInput source="options.client_id" label="Client ID" />
        <SecretInput source="options.client_secret" label="Client Secret" />
        <TextInput source="options.scope" label="Scope" multiline />
        <TextInput
          source="options.authorization_endpoint"
          label="Authorization Endpoint"
        />
        <TextInput source="options.token_endpoint" label="Token Endpoint" />
        <TextInput source="options.userinfo_endpoint" label="Userinfo Endpoint" />
        <TextInput source="options.jwks_uri" label="JWKS URI" />
        <BooleanInput source="options.disable_signup" label="Disable Signup" />
      </SimpleForm>
    </Edit>
  );
}
