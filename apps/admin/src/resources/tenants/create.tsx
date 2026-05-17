import { Create, SimpleForm, TextInput } from "@/components/admin";

export function TenantsCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="id" />
        <TextInput source="friendly_name" label="Name" required />
        <TextInput source="audience" required />
        <TextInput source="sender_email" required />
        <TextInput source="sender_name" required />
        <TextInput source="support_url" label="Support URL" />
      </SimpleForm>
    </Create>
  );
}
