import { Create, SimpleForm, TextInput, required } from "react-admin";

export function UserCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="email" type="email" validate={[required()]} />
        <TextInput source="name" />
        <TextInput source="given_name" />
        <TextInput source="family_name" />
        <TextInput source="picture" />
      </SimpleForm>
    </Create>
  );
}
