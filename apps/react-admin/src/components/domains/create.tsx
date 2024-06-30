import { Create, SimpleForm, TextInput, required } from "react-admin";

export function DomainCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="domain" validate={[required()]} />
      </SimpleForm>
    </Create>
  );
}
