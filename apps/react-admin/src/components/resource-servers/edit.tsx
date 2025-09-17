import {
  Edit,
  TextInput,
  BooleanInput,
  ArrayInput,
  SimpleFormIterator,
  TextField,
  TabbedForm,
  required,
  NumberInput,
  FormDataConsumer,
} from "react-admin";
import { Stack } from "@mui/material";

export function ResourceServerEdit() {
  return (
    <Edit>
      <TabbedForm>
        <TabbedForm.Tab label="Details">
          <Stack spacing={2}>
            <TextInput source="name" validate={[required()]} />
            <TextInput
              source="identifier"
              validate={[required()]}
              helperText="Unique identifier for this resource server"
            />
            <TextInput
              source="audience"
              helperText="Optional audience parameter"
            />
          </Stack>

          <Stack spacing={2} direction="row" sx={{ mt: 2 }}>
            <BooleanInput
              source="signing_alg_values_supported"
              defaultValue={true}
            />
            <BooleanInput
              source="skip_consent_for_verifiable_first_party_clients"
              defaultValue={true}
            />
            <BooleanInput source="allow_offline_access" defaultValue={true} />
          </Stack>

          <Stack spacing={2} direction="row" sx={{ mt: 2 }}>
            <TextInput
              source="signing_alg"
              defaultValue="RS256"
              helperText="Signing algorithm for tokens"
            />
          </Stack>

          <Stack spacing={2} direction="row" sx={{ mt: 2 }}>
            <NumberInput
              source="token_lifetime"
              defaultValue={1209600}
              helperText="Token lifetime in seconds (default: 14 days)"
            />
            <NumberInput
              source="token_lifetime_for_web"
              defaultValue={7200}
              helperText="Web token lifetime in seconds (default: 2 hours)"
            />
          </Stack>

          <Stack spacing={2} direction="row" sx={{ mt: 4 }}>
            <TextField source="created_at" />
            <TextField source="updated_at" />
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="RBAC">
          <Stack spacing={3}>
            <BooleanInput
              source="enforce_policies"
              label="Enable RBAC"
              helperText="Enable Role-Based Access Control for this resource server"
            />

            <FormDataConsumer>
              {({ formData }) => (
                <BooleanInput
                  source="token_dialect"
                  label="Add permissions in token"
                  helperText="Include permissions directly in the access token"
                  disabled={!formData?.enforce_policies}
                  format={(value) => value === "access_token_authz"}
                  parse={(checked) =>
                    checked ? "access_token_authz" : "access_token"
                  }
                />
              )}
            </FormDataConsumer>
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Scopes">
          <ArrayInput source="scopes" label="">
            <SimpleFormIterator>
              <Stack
                spacing={2}
                direction="row"
                sx={{ width: "100%", alignItems: "flex-start" }}
              >
                <TextInput
                  source="value"
                  validate={[required()]}
                  label="Scope Name"
                  helperText="e.g., read:users, write:posts"
                  sx={{ flex: 1 }}
                />
                <TextInput
                  source="description"
                  label="Description"
                  helperText="What this scope allows"
                  sx={{ flex: 2 }}
                />
              </Stack>
            </SimpleFormIterator>
          </ArrayInput>
        </TabbedForm.Tab>
      </TabbedForm>
    </Edit>
  );
}
