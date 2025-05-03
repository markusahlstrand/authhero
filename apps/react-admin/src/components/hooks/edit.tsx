import {
  BooleanInput,
  DateField,
  Edit,
  FieldTitle,
  Labeled,
  NumberInput,
  regex,
  required,
  SelectInput,
  SimpleForm,
  TextInput,
} from "react-admin";

export function HookEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput
          source="url"
          validate={[
            required(),
            regex(/^https?:\/\/./, "Must be a valid HTTP/HTTPS URL"),
          ]}
          helperText="The webhook endpoint URL that will be called"
        />
        <SelectInput
          source="trigger_id"
          choices={[
            { id: "pre-user-signup", name: "Pre User Signup" },
            { id: "post-user-registration", name: "Post User Registration" },
            { id: "post-user-login", name: "Post User Login" },
          ]}
        />
        <BooleanInput source="enabled" />
        <BooleanInput
          source="synchronous"
          helperText="The event waits for the webhook to complete and can be canceled"
        />
        <NumberInput
          source="priority"
          helperText="A hook with higher priority will be executed first"
        />
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
