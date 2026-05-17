import { Create, SimpleForm, TextInput, SelectInput } from "@/components/admin";
import { Strategy } from "@/utils/Strategy";

const strategyChoices = [
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
];

export function ConnectionCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" required />
        <SelectInput source="strategy" choices={strategyChoices} />
      </SimpleForm>
    </Create>
  );
}
