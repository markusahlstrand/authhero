import {
  DateField,
  Edit,
  FieldTitle,
  Labeled,
  SelectInput,
  TextInput,
  BooleanInput,
  SimpleShowLayout,
  TextField,
  TabbedForm,
  SimpleFormIterator,
  ArrayInput,
  FunctionField,
} from "react-admin";
import { JsonOutput } from "../common/JsonOutput";

export function ApplicationEdit() {
  return (
    <Edit>
      <SimpleShowLayout>
        <TextField source="name" />
        <TextField source="id" />
      </SimpleShowLayout>
      <TabbedForm>
        <TabbedForm.Tab label="details">
          <TextInput source="id" />
          <TextInput source="name" />
          <TextInput source="client_secret" />
          <SelectInput
            source="email_validation"
            choices={[
              { id: "disabled", name: "Disabled" },
              { id: "enabled", name: "Enabled" },
              { id: "enforced", name: "Enforced" },
            ]}
          />
          <BooleanInput source="disable_sign_ups" />
          <ArrayInput source="callbacks">
            <SimpleFormIterator inline>
              <TextInput source="" defaultValue="" />
            </SimpleFormIterator>
          </ArrayInput>
          <ArrayInput source="allowed_logout_urls">
            <SimpleFormIterator inline>
              <TextInput source="" defaultValue="" />
            </SimpleFormIterator>
          </ArrayInput>
          <ArrayInput source="web_origins">
            <SimpleFormIterator inline>
              <TextInput source="" defaultValue="" />
            </SimpleFormIterator>
          </ArrayInput>
          <ArrayInput source="allowed_clients">
            <SimpleFormIterator inline>
              <TextInput source="" defaultValue="" />
            </SimpleFormIterator>
          </ArrayInput>
          <Labeled label={<FieldTitle source="created_at" />}>
            <DateField source="created_at" showTime={true} />
          </Labeled>
          <Labeled label={<FieldTitle source="updated_at" />}>
            <DateField source="updated_at" showTime={true} />
          </Labeled>
        </TabbedForm.Tab>
        <TabbedForm.Tab label="SSO">
          <TextInput source="addons.samlp.audience" label="audience" />
          <TextInput source="addons.samlp.destination" label="destination" />
          <TextInput
            multiline
            source="addons.samlp.mappings"
            format={(value) => (value ? JSON.stringify(value, null, 2) : "")}
            parse={(value) => {
              try {
                return value ? JSON.parse(value) : {};
              } catch (e) {
                return {};
              }
            }}
          />
        </TabbedForm.Tab>
        <TabbedForm.Tab label="Raw JSON">
          <FunctionField
            source="date"
            render={(record: any) => <JsonOutput data={record} />}
          />
        </TabbedForm.Tab>
      </TabbedForm>
    </Edit>
  );
}
