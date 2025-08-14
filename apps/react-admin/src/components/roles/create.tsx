import { Create, SimpleForm, TextInput, required } from "react-admin";

export function RoleCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" validate={[required()]} />
        <TextInput source="description" multiline />
      </SimpleForm>
    </Create>
  );
}
