import {
  Create,
  SimpleForm,
  TextInput,
  BooleanInput,
  NumberInput,
  ArrayInput,
  SimpleFormIterator,
} from "@/components/admin";

export function ResourceServerCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" required />
        <TextInput
          source="identifier"
          required
          helperText="Unique identifier for this resource server"
        />
        <BooleanInput source="allow_offline_access" defaultValue={true} />
        <BooleanInput
          source="skip_consent_for_verifiable_first_party_clients"
          defaultValue={true}
        />
        <BooleanInput source="options.enforce_policies" defaultValue={true} />
        <TextInput source="signing_alg" defaultValue="RS256" />
        <TextInput
          source="options.token_dialect"
          defaultValue="access_token_authz"
        />
        <NumberInput source="token_lifetime" defaultValue={86400} />
        <NumberInput source="token_lifetime_for_web" defaultValue={7200} />

        <ArrayInput source="scopes" label="Scopes">
          <SimpleFormIterator inline>
            <TextInput source="value" label="Scope" required />
            <TextInput source="description" label="Description" />
          </SimpleFormIterator>
        </ArrayInput>
      </SimpleForm>
    </Create>
  );
}
