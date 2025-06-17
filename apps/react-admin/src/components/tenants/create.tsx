import { Create, SimpleForm, TextInput, required } from "react-admin";

export function TenantsCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="id" />
        <TextInput source="name" validate={[required()]} />
        <TextInput source="audience" validate={[required()]} />
        <TextInput source="sender_email" validate={[required()]} />
        <TextInput source="sender_name" validate={[required()]} />
        <TextInput source="support_url" label="Support Url" />
      </SimpleForm>
    </Create>
  );
}
