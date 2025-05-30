import {
  ChipField,
  Edit,
  FunctionField,
  ReferenceManyField,
  SelectInput,
  SimpleShowLayout,
  SingleFieldList,
  TabbedForm,
  TextField,
  TextInput,
  useRecordContext,
} from "react-admin";
import { JsonOutput } from "../common/JsonOutput";

export function ConnectionEdit(props: any) {
  return (
    <Edit {...props}>
      <ConnectionTabbedFrom />
    </Edit>
  );
}

function ConnectionTabbedFrom() {
  const record = useRecordContext();

  console.log("strategy", record?.strategy);

  return (
    <Edit>
      <SimpleShowLayout>
        <TextField source="name" />
        <TextField source="id" />
      </SimpleShowLayout>
      <TabbedForm>
        <TabbedForm.Tab label="details">
          <TextInput source="id" label="Client ID" style={{ width: "800px" }} />
          <TextInput disabled source="strategy" />
          <TextInput source="options.client_id" label="Client Id" />
          <TextInput
            source="options.client_secret"
            label="Client Secret"
            style={{ width: "800px" }}
          />

          {record?.strategy === "apple" && (
            <>
              <TextInput source="options.kid" label="Key ID" />
              <TextInput source="options.team_id" label="Team ID" />
              <TextInput source="options.realms" label="Realms" />
              <TextInput source="options.app_secret" label="App Secret" />
              <TextInput source="options.scope" fullWidth />
            </>
          )}

          {record?.strategy === "oauth2" && (
            <>
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
              <TextInput source="options.scope" fullWidth />
              <TextInput
                source="options.authorization_endpoint"
                label="Authorization Endpoint"
                fullWidth
              />
              <TextInput
                source="options.userinfo_endpoint"
                label="Userinfo Endpoint"
                fullWidth
              />
              <TextInput
                source="options.token_endpoint"
                label="Token Endpoint"
                fullWidth
              />
            </>
          )}

          {record?.strategy === "sms" && (
            <>
              <TextInput
                source="options.twilio_sid"
                label="Twillio Account ID"
              />
              <TextInput source="options.twilio_token" label="Twilio Token" />
              <TextInput source="options.from" label="From" />
            </>
          )}

          <ReferenceManyField reference="clients" target="id">
            <SingleFieldList>
              <ChipField source="name" size="small" />
            </SingleFieldList>
          </ReferenceManyField>
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
