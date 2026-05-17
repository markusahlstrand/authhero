import { Edit, SimpleForm, TextInput } from "@/components/admin";

export function RoleEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="id" readOnly />
        <TextInput source="name" required />
        <TextInput source="description" multiline />
      </SimpleForm>
    </Edit>
  );
}
