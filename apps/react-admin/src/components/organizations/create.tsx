import { Create, SimpleForm, TextInput, required } from "react-admin";

export function OrganizationCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" validate={[required()]} />
        <TextInput source="display_name" />
        <TextInput source="description" multiline />
      </SimpleForm>
    </Create>
  );
}
