import {
  DateField,
  Edit,
  FieldTitle,
  Labeled,
  SelectInput,
  SimpleForm,
  TextInput,
} from "react-admin";

export function ConnectionEdit() {
  return (
    <Edit>
      <SimpleForm>
        <TextInput source="id" />
        <TextInput source="name" />
        <TextInput
          source="client_id"
          label="Client ID"
          style={{ width: "800px" }}
        />
        <TextInput
          source="client_secret"
          label="Client Secret"
          style={{ width: "800px" }}
        />
        <SelectInput
          source="response_type"
          label="Response Type"
          choices={[
            { id: "code", name: "Code" },
            { id: "code id_token", name: "Code ID-token" },
          ]}
        />
        <SelectInput
          source="response_mode"
          label="Response Mode"
          choices={[
            { id: "query", name: "Query" },
            { id: "fragment", name: "Fragment" },
            { id: "web_message", name: "Web Message" },
            { id: "form_post", name: "Form Post" },
          ]}
        />
        <TextInput source="scope" fullWidth />
        <TextInput
          source="private_key"
          label="Private Key"
          style={{ width: "800px" }}
          multiline={true}
        />
        <TextInput source="kid" label="Key ID" />
        <TextInput source="team_id" label="Team ID" />
        <TextInput source="token_endpoint" fullWidth />
        <TextInput source="authorization_endpoint" fullWidth />
        <TextInput source="userinfo_endpoint" fullWidth />
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
