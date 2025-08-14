import {
  Edit,
  TextInput,
  BooleanInput,
  ArrayInput,
  SimpleFormIterator,
  TextField,
  DateField,
  TabbedForm,
  required,
  Datagrid,
  ReferenceManyField,
  Pagination,
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
            <BooleanInput source="enforce_policies" defaultValue={true} />
            <TextInput
              source="signing_alg"
              defaultValue="RS256"
              helperText="Signing algorithm for tokens"
            />
            <TextInput
              source="token_dialect"
              defaultValue="access_token_authz"
              helperText="Token dialect format"
            />
          </Stack>

          <Stack spacing={2} direction="row" sx={{ mt: 2 }}>
            <TextInput
              source="token_lifetime"
              type="number"
              defaultValue={1209600}
              helperText="Token lifetime in seconds (default: 14 days)"
            />
            <TextInput
              source="token_lifetime_for_web"
              type="number"
              defaultValue={7200}
              helperText="Web token lifetime in seconds (default: 2 hours)"
            />
          </Stack>

          <Stack spacing={2} direction="row" sx={{ mt: 4 }}>
            <TextField source="created_at" />
            <TextField source="updated_at" />
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

        <TabbedForm.Tab label="Permissions">
          <ReferenceManyField
            reference="permissions"
            target="resource_server_id"
            pagination={<Pagination />}
            sort={{ field: "permission_name", order: "ASC" }}
          >
            <Datagrid rowClick="" bulkActionButtons={false}>
              <TextField source="permission_name" label="Permission" />
              <TextField source="description" />
              <DateField source="created_at" showTime />
            </Datagrid>
          </ReferenceManyField>
        </TabbedForm.Tab>
      </TabbedForm>
    </Edit>
  );
}
