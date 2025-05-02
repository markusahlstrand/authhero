import {
  BooleanInput,
  Create,
  NumberInput,
  SelectInput,
  SimpleForm,
  TextInput,
  required,
} from "react-admin";

export function HooksCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="url" validate={[required()]} />
        <SelectInput
          source="trigger_id"
          choices={[
            { id: "pre-user-signup", name: "Pre User Signup" },
            { id: "post-user-registration", name: "Post User Registration" },
            { id: "post-user-login", name: "Post User Login" },
          ]}
          required
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
      </SimpleForm>
    </Create>
  );
}
