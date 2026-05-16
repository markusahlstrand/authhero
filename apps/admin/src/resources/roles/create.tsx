import { Create, SimpleForm, TextInput } from "@/components/admin";

export function RoleCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" required />
        <TextInput source="description" multiline />
      </SimpleForm>
    </Create>
  );
}
