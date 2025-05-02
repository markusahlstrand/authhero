import { Create, SimpleForm, TextInput, required } from "react-admin";

export function ApplicationCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" validate={[required()]} />
        <TextInput source="id" validate={[required()]} />
      </SimpleForm>
    </Create>
  );
}
