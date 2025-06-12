import {
  DateField,
  Edit,
  FieldTitle,
  Labeled,
  TextInput,
  TabbedForm,
} from "react-admin";
import { ColorInput } from "react-admin-color-picker";

export function BrandingEdit() {
  return (
    <Edit>
      <TabbedForm>
        <TabbedForm.Tab label="Info">
          <TextInput source="id" />
          <TextInput source="name" />
          <Labeled label={<FieldTitle source="created_at" />}>
            <DateField source="created_at" showTime={true} />
          </Labeled>
          <Labeled label={<FieldTitle source="updated_at" />}>
            <DateField source="updated_at" showTime={true} />
          </Labeled>
        </TabbedForm.Tab>
        <TabbedForm.Tab label="Style">
          <ColorInput source="colors.primary" label="Primary Color" />
          <ColorInput source="colors.page_background" label="Page Background" />
          <TextInput source="favicon_url" label="Favicon URL" />
          <TextInput source="logo_url" label="Logo URL" />
          <TextInput source="font.url" label="Font URL" />
        </TabbedForm.Tab>
      </TabbedForm>
    </Edit>
  );
}
