import { Create, SimpleForm, TextInput } from "@/components/admin";

export function OrganizationCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" required />
        <TextInput source="display_name" />
        <TextInput source="description" multiline />
      </SimpleForm>
    </Create>
  );
}
