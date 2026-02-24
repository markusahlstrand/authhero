import {
  ArrayInput,
  BooleanInput,
  ChipField,
  Edit,
  FormDataConsumer,
  FunctionField,
  NumberInput,
  ReferenceManyField,
  SelectInput,
  SimpleFormIterator,
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
          <TextInput
            source="display_name"
            label="Display Name"
            helperText="Custom display name for the login button (optional)"
            fullWidth
          />
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

          {record?.strategy === "github" && (
            <>
              <TextInput
                source="options.scope"
                label="Scope"
                placeholder="user:email"
                helperText="Space-separated scopes (e.g., user:email read:user)"
                fullWidth
              />
            </>
          )}

          {record?.strategy === "microsoft" && (
            <>
              <TextInput
                source="options.realms"
                label="Tenant ID"
                placeholder="common"
                helperText="Use 'common', 'organizations', 'consumers', or your tenant ID"
              />
              <TextInput
                source="options.scope"
                label="Scope"
                placeholder="openid profile email"
                helperText="Space-separated scopes"
                fullWidth
              />
            </>
          )}

          {["oauth2", "oidc"].includes(record?.strategy) && (
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
              <TextInput source="options.icon_url" label="Icon URL" fullWidth />
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

          {record?.strategy === "Username-Password-Authentication" && (
            <>
              <BooleanInput
                source="options.attributes.username.identifier.active"
                label="Username as Identifier"
                helperText="Allow users to log in with a username in addition to email"
              />
              <FormDataConsumer>
                {({ formData }) =>
                  formData?.options?.attributes?.username?.identifier
                    ?.active && (
                    <>
                      <NumberInput
                        source="options.attributes.username.validation.min_length"
                        label="Minimum Username Length"
                        defaultValue={1}
                        min={1}
                      />
                      <NumberInput
                        source="options.attributes.username.validation.max_length"
                        label="Maximum Username Length"
                        defaultValue={15}
                        min={1}
                      />
                    </>
                  )
                }
              </FormDataConsumer>
              <SelectInput
                source="options.passwordPolicy"
                label="Password Policy"
                choices={[
                  { id: "none", name: "None" },
                  { id: "low", name: "Low" },
                  { id: "fair", name: "Fair" },
                  { id: "good", name: "Good" },
                  { id: "excellent", name: "Excellent" },
                  { id: null, name: "Null" },
                ]}
              />
              <NumberInput
                source="options.password_complexity_options.min_length"
                label="Minimum Password Length"
              />
              <BooleanInput
                source="options.password_history.enable"
                label="Enable Password History"
              />
              <NumberInput
                source="options.password_history.size"
                label="Password History Size"
              />
              <BooleanInput
                source="options.password_no_personal_info.enable"
                label="Enable No Personal Info in Passwords"
              />
              <BooleanInput
                source="options.password_dictionary.enable"
                label="Enable Password Dictionary"
              />
              <ArrayInput
                source="options.password_dictionary.dictionary"
                label="Custom Password Dictionary"
              >
                <SimpleFormIterator>
                  <TextInput
                    source=""
                    label="Dictionary Entry"
                    validate={(value) =>
                      value && value.length > 50
                        ? "Entry must be 50 characters or less"
                        : undefined
                    }
                  />
                </SimpleFormIterator>
              </ArrayInput>
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
