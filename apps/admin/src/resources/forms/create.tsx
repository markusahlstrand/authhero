import { Create, SimpleForm, TextInput } from "@/components/admin";

export function FormCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" required />
      </SimpleForm>
    </Create>
  );
}
