import {
  Create,
  SelectInput,
  SimpleForm,
  TextInput,
  required,
} from "react-admin";

export function ConnectionCreate() {
  return (
    <Create>
      <SimpleForm>
        <TextInput source="name" validate={[required()]} />
        <SelectInput
          source="strategy"
          label="Strategy"
          choices={[
            { id: "email", name: "Email" },
            { id: "google-oauth2", name: "Google" },
            { id: "facebook", name: "Facebook" },
            { id: "apple", name: "Apple" },
            { id: "vipps", name: "Vipps" },
            { id: "oauth2", name: "OAuth2" },
            { id: "Username-Password-Authentication", name: "Password" },
            { id: "sms", name: "SMS" },
          ]}
        />
      </SimpleForm>
    </Create>
  );
}
