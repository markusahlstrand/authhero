import { Create, SimpleForm, TextInput } from "@/components/admin";

export function FlowCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" required />
      </SimpleForm>
    </Create>
  );
}
