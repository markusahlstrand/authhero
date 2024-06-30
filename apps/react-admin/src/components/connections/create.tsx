import { Create, SimpleForm, TextInput, required } from "react-admin";

export function ConnectionCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" validate={[required()]} />
      </SimpleForm>
    </Create>
  );
}
