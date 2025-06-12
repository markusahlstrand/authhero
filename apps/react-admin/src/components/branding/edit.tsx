import {
  DateField,
  Edit,
  FieldTitle,
  Labeled,
  SelectInput,
  TabbedForm,
  TextInput,
} from "react-admin";
import { ColorInput } from "react-admin-color-picker";

export function BrandingEdit() {
  return (
    <Edit id="current">
      <TabbedForm>
        <TabbedForm.Tab label="Info">
          <TextInput source="name" />
          <TextInput source="audience" label="Audience" />
          <TextInput source="support_url" label="Support URL" />
          <Labeled label={<FieldTitle source="created_at" />}>
            <DateField source="created_at" showTime={true} />
          </Labeled>
          <Labeled label={<FieldTitle source="updated_at" />}>
            <DateField source="updated_at" showTime={true} />
          </Labeled>
        </TabbedForm.Tab>
        <TabbedForm.Tab label="Communication">
          <TextInput source="sender_email" label="Sender Email" />
          <TextInput source="sender_name" label="Sender Name" />
        </TabbedForm.Tab>
        <TabbedForm.Tab label="Style">
          <SelectInput
            source="language"
            label="Language"
            choices={[
              { id: "en", name: "English" },
              { id: "nb", name: "Norwegian" },
              { id: "sv", name: "Swedish" },
              { id: "it", name: "Italian" },
              { id: "pl", name: "Polish" },
            ]}
          />
          <ColorInput source="primary_color" label="Primary Color" />
          <ColorInput source="secondary_color" label="Secondary Color" />
          <TextInput source="logo" label="Logo" />
        </TabbedForm.Tab>
      </TabbedForm>
    </Edit>
  );
}
