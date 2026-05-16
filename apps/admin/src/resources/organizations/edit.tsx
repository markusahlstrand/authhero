import { Edit, SimpleForm, TextInput } from "@/components/admin";

export function OrganizationEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="id" readOnly />
        <TextInput source="name" required />
        <TextInput source="display_name" />
        <TextInput source="description" multiline />
        <TextInput source="branding.logo_url" label="Logo URL" />
        <TextInput source="branding.colors.primary" label="Primary color" />
        <TextInput
          source="branding.colors.page_background"
          label="Page background color"
        />
      </SimpleForm>
    </Edit>
  );
}
