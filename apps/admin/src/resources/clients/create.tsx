import { Create, SimpleForm, TextInput } from "@/components/admin";

export function ClientCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" required />
        <TextInput source="client_id" required />
      </SimpleForm>
    </Create>
  );
}
