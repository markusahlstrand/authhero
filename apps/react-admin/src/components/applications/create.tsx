import {
  Create,
  SimpleForm,
  TextInput,
  required,
  SelectInput,
} from "react-admin";

export function ApplicationCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" validate={[required()]} />
        <TextInput source="allowed_callback_urls" fullWidth multiline={true} />
        <TextInput source="allowed_logout_urls" fullWidth multiline={true} />
        <TextInput source="allowed_web_origins" fullWidth multiline={true} />
        <TextInput source="id" validate={[required()]} />
        <SelectInput
          source="email_validation"
          choices={[
            { id: "disabled", name: "Disabled" },
            { id: "enabled", name: "Enabled" },
            { id: "enforced", name: "Enforced" },
          ]}
        />
      </SimpleForm>
    </Create>
  );
}
