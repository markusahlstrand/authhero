import {
  DateField,
  Edit,
  FieldTitle,
  Labeled,
  SelectInput,
  SimpleForm,
  TextInput,
  BooleanInput,
} from "react-admin";

export function ApplicationEdit() {
  return (
    <Edit>
      <SimpleForm>
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
        <TextInput source="allowed_callback_urls" fullWidth multiline={true} />
        <TextInput source="allowed_logout_urls" fullWidth multiline={true} />
        <TextInput source="allowed_web_origins" fullWidth multiline={true} />
        <Labeled label={<FieldTitle source="created_at" />}>
          <DateField source="created_at" showTime={true} />
        </Labeled>
        <Labeled label={<FieldTitle source="updated_at" />}>
          <DateField source="updated_at" showTime={true} />
        </Labeled>
      </SimpleForm>
    </Edit>
  );
}
