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
import { Typography, Box, Divider } from "@mui/material";
import { JsonOutput } from "../common/JsonOutput";

/**
 * Recursively strip null values from an object so react-admin's
 * cleared inputs don't send "null" to the API.
 */
function stripNulls(obj: any): any {
  if (obj === null) return undefined;
  if (Array.isArray(obj))
    return obj.map(stripNulls).filter((v: any) => v !== undefined);
  if (typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj)
        .map(([k, v]) => [k, stripNulls(v)])
        .filter(([, v]) => v !== undefined),
    );
  }
  return obj;
}

export function ConnectionEdit(props: any) {
  return (
    <Edit {...props} transform={stripNulls}>
      <ConnectionTabbedFrom />
    </Edit>
  );
}

const isDbConnection = (strategy?: string) =>
  strategy === "Username-Password-Authentication";

function ConnectionTabbedFrom() {
  const record = useRecordContext();

  return (
    <Edit transform={stripNulls}>
      <SimpleShowLayout>
        <TextField source="name" />
        <TextField source="id" />
      </SimpleShowLayout>
      <TabbedForm>
        {/* ───── Details tab ───── */}
        <TabbedForm.Tab label="Details">
          <TextInput source="id" label="Client ID" style={{ width: "800px" }} />
          <TextInput disabled source="strategy" />
          <TextInput
            source="display_name"
            label="Display Name"
            helperText="Custom display name for the login button (optional)"
            fullWidth
          />
          {!isDbConnection(record?.strategy) && (
            <>
              <TextInput source="options.client_id" label="Client Id" />
              <TextInput
                source="options.client_secret"
                label="Client Secret"
                style={{ width: "800px" }}
              />
            </>
          )}

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

          {isDbConnection(record?.strategy) && (
            <>
              <BooleanInput
                source="options.disable_signup"
                label="Disable Sign Ups"
                helperText="Prevent new user sign ups from this connection"
              />
              <BooleanInput
                source="options.brute_force_protection"
                label="Brute Force Protection"
              />
              <BooleanInput
                source="options.import_mode"
                label="Import Mode"
                helperText="Only allow imported users to log in"
              />
            </>
          )}

          <ReferenceManyField reference="clients" target="id">
            <SingleFieldList>
              <ChipField source="name" size="small" />
            </SingleFieldList>
          </ReferenceManyField>
        </TabbedForm.Tab>

        {/* ───── Attributes tab (db connections only) ───── */}
        {isDbConnection(record?.strategy) && (
          <TabbedForm.Tab label="Attributes">
            {/* Email */}
            <Typography variant="h6" sx={{ mt: 1, mb: 1 }}>
              Email
            </Typography>
            <BooleanInput
              source="options.attributes.email.identifier.active"
              label="Use as Identifier"
              helperText="Allow users to identify with their email address"
              defaultValue={true}
            />
            <SelectInput
              source="options.attributes.email.signup.status"
              label="Signup Status"
              helperText="Whether email is required, optional or disabled during sign up"
              choices={[
                { id: "required", name: "Required" },
                { id: "optional", name: "Optional" },
                { id: "disabled", name: "Disabled" },
              ]}
              defaultValue="required"
            />
            <BooleanInput
              source="options.attributes.email.signup.verification.active"
              label="Email Verification"
              helperText="Require email verification after signup"
              defaultValue={true}
            />
            <SelectInput
              source="options.attributes.email.verification_method"
              label="Verification Method"
              choices={[
                { id: "link", name: "Link" },
                { id: "code", name: "Code" },
              ]}
              defaultValue="link"
            />

            <Box sx={{ my: 2 }}>
              <Divider />
            </Box>

            {/* Username */}
            <Typography variant="h6" sx={{ mt: 1, mb: 1 }}>
              Username
            </Typography>
            <BooleanInput
              source="options.attributes.username.identifier.active"
              label="Use as Identifier"
              helperText="Allow users to identify with a username"
            />
            <FormDataConsumer>
              {({ formData }) =>
                formData?.options?.attributes?.username?.identifier?.active && (
                  <>
                    <SelectInput
                      source="options.attributes.username.signup.status"
                      label="Signup Status"
                      helperText="Whether username is required or optional during sign up"
                      choices={[
                        { id: "required", name: "Required" },
                        { id: "optional", name: "Optional" },
                        { id: "disabled", name: "Disabled" },
                      ]}
                      defaultValue="required"
                    />
                    <NumberInput
                      source="options.attributes.username.validation.min_length"
                      label="Minimum Length"
                      defaultValue={1}
                      min={1}
                    />
                    <NumberInput
                      source="options.attributes.username.validation.max_length"
                      label="Maximum Length"
                      defaultValue={15}
                      min={1}
                    />
                    <BooleanInput
                      source="options.attributes.username.validation.allowed_types.email"
                      label="Allow Email as Username"
                      helperText="Allow users to use an email address as their username"
                    />
                    <BooleanInput
                      source="options.attributes.username.validation.allowed_types.phone_number"
                      label="Allow Phone Number as Username"
                      helperText="Allow users to use a phone number as their username"
                    />
                  </>
                )
              }
            </FormDataConsumer>

            <Box sx={{ my: 2 }}>
              <Divider />
            </Box>

            {/* Phone Number */}
            <Typography variant="h6" sx={{ mt: 1, mb: 1 }}>
              Phone Number
            </Typography>
            <BooleanInput
              source="options.attributes.phone_number.identifier.active"
              label="Use as Identifier"
              helperText="Allow users to identify with a phone number"
            />
            <FormDataConsumer>
              {({ formData }) =>
                formData?.options?.attributes?.phone_number?.identifier
                  ?.active && (
                  <SelectInput
                    source="options.attributes.phone_number.signup.status"
                    label="Signup Status"
                    choices={[
                      { id: "required", name: "Required" },
                      { id: "optional", name: "Optional" },
                      { id: "disabled", name: "Disabled" },
                    ]}
                    defaultValue="optional"
                  />
                )
              }
            </FormDataConsumer>
          </TabbedForm.Tab>
        )}

        {/* ───── Authentication Methods tab (db connections only) ───── */}
        {isDbConnection(record?.strategy) && (
          <TabbedForm.Tab label="Authentication Methods">
            {/* Password */}
            <Typography variant="h6" sx={{ mt: 1, mb: 1 }}>
              Password
            </Typography>
            <BooleanInput
              source="options.authentication_methods.password.enabled"
              label="Enable Password Authentication"
              defaultValue={true}
            />

            <Box sx={{ my: 2 }}>
              <Divider />
            </Box>

            {/* Passkey */}
            <Typography variant="h6" sx={{ mt: 1, mb: 1 }}>
              Passkey
            </Typography>
            <BooleanInput
              source="options.authentication_methods.passkey.enabled"
              label="Enable Passkey Authentication"
            />
            <FormDataConsumer>
              {({ formData }) =>
                formData?.options?.authentication_methods?.passkey?.enabled && (
                  <>
                    <SelectInput
                      source="options.passkey_options.challenge_ui"
                      label="Challenge UI"
                      helperText="How browsers present the passkey challenge"
                      choices={[
                        { id: "both", name: "Both" },
                        { id: "autofill", name: "Autofill" },
                        { id: "button", name: "Button" },
                      ]}
                      defaultValue="both"
                    />
                    <BooleanInput
                      source="options.passkey_options.progressive_enrollment_enabled"
                      label="Progressive Enrollment"
                      helperText="Prompt existing users to enroll a passkey on login"
                    />
                    <BooleanInput
                      source="options.passkey_options.local_enrollment_enabled"
                      label="Local Enrollment"
                      helperText="Allow users to enroll a passkey from their profile"
                    />
                  </>
                )
              }
            </FormDataConsumer>
          </TabbedForm.Tab>
        )}

        {/* ───── Password Policy tab (db connections only) ───── */}
        {isDbConnection(record?.strategy) && (
          <TabbedForm.Tab label="Password Policy">
            <SelectInput
              source="options.passwordPolicy"
              label="Password Policy"
              choices={[
                { id: "none", name: "None" },
                { id: "low", name: "Low" },
                { id: "fair", name: "Fair" },
                { id: "good", name: "Good" },
                { id: "excellent", name: "Excellent" },
              ]}
            />
            <NumberInput
              source="options.password_complexity_options.min_length"
              label="Minimum Password Length"
            />

            <Box sx={{ my: 2 }}>
              <Divider />
            </Box>

            <BooleanInput
              source="options.password_history.enable"
              label="Enable Password History"
            />
            <FormDataConsumer>
              {({ formData }) =>
                formData?.options?.password_history?.enable && (
                  <NumberInput
                    source="options.password_history.size"
                    label="Password History Size"
                  />
                )
              }
            </FormDataConsumer>
            <BooleanInput
              source="options.password_no_personal_info.enable"
              label="No Personal Info in Passwords"
            />
            <BooleanInput
              source="options.password_dictionary.enable"
              label="Enable Password Dictionary"
            />
            <FormDataConsumer>
              {({ formData }) =>
                formData?.options?.password_dictionary?.enable && (
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
                )
              }
            </FormDataConsumer>
          </TabbedForm.Tab>
        )}

        {/* ───── Raw JSON tab ───── */}
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
