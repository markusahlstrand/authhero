import {
  Create,
  SimpleForm,
  TextInput,
  SelectInput,
  required,
} from "react-admin";

export function DomainCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="domain" validate={[required()]} />
        <SelectInput
          source="type"
          validate={[required()]}
          defaultValue="auth0_managed_certs"
          choices={[
            { id: "auth0_managed_certs", name: "Auth0 Managed Certificates" },
            { id: "self_managed_certs", name: "Self Managed Certificates" },
          ]}
        />
      </SimpleForm>
    </Create>
  );
}
