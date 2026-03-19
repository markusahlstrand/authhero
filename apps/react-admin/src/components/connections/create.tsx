import {
  Create,
  SelectInput,
  SimpleForm,
  TextInput,
  required,
} from "react-admin";
import { Strategy } from "@authhero/adapter-interfaces";

export function ConnectionCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" validate={[required()]} />
        <SelectInput
          source="strategy"
          label="Strategy"
          choices={[
            { id: Strategy.EMAIL, name: "Email" },
            { id: Strategy.GOOGLE_OAUTH2, name: "Google" },
            { id: Strategy.FACEBOOK, name: "Facebook" },
            { id: Strategy.APPLE, name: "Apple" },
            { id: Strategy.GITHUB, name: "GitHub" },
            { id: Strategy.MICROSOFT, name: "Microsoft" },
            { id: Strategy.VIPPS, name: "Vipps" },
            { id: Strategy.OAUTH2, name: "OAuth2" },
            { id: Strategy.OIDC, name: "OpenID Connect" },
            { id: Strategy.USERNAME_PASSWORD, name: "Password" },
            { id: Strategy.SMS, name: "SMS" },
            { id: Strategy.SAMLP, name: "SAML" },
          ]}
        />
      </SimpleForm>
    </Create>
  );
}
