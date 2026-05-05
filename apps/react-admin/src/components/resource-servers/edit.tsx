import {
  Edit,
  TextInput,
  BooleanInput,
  DateField,
  Labeled,
  TabbedForm,
  required,
  NumberInput,
  FormDataConsumer,
  useRecordContext,
} from "react-admin";
import { Stack, Alert, Box } from "@mui/material";
import { ScopesPanel } from "../resource-server-scopes";

function SystemEntityAlert() {
  const record = useRecordContext();
  if (!record?.is_system) return null;

  return (
    <Alert severity="info" sx={{ mb: 2 }}>
      This Resource Server represents a system entity. Most fields cannot be
      modified or deleted, but you can still configure token lifetime and
      authorize applications to consume this resource server.
    </Alert>
  );
}

function ScopesTabContent() {
  const record = useRecordContext();
  if (!record?.id) return null;
  return <ScopesPanel rsId={String(record.id)} readOnly={!!record.is_system} />;
}

function ResourceServerForm() {
  const record = useRecordContext();
  const isSystem = record?.is_system;

  return (
    <>
      {isSystem && (
        <Box sx={{ px: 2, pt: 2 }}>
          <SystemEntityAlert />
        </Box>
      )}
      <TabbedForm>
        <TabbedForm.Tab label="Details">
          <Stack spacing={2}>
            <TextInput
              source="name"
              validate={[required()]}
              disabled={isSystem}
            />
            <TextInput
              source="identifier"
              validate={[required()]}
              helperText="Unique identifier for this resource server"
              disabled={isSystem}
            />
          </Stack>

          <Stack spacing={2} direction="row" sx={{ mt: 2 }}>
            <BooleanInput
              source="signing_alg_values_supported"
              defaultValue={true}
              disabled={isSystem}
            />
            <BooleanInput
              source="skip_consent_for_verifiable_first_party_clients"
              defaultValue={true}
              disabled={isSystem}
            />
            <BooleanInput
              source="allow_offline_access"
              defaultValue={true}
              disabled={isSystem}
            />
          </Stack>

          <Stack spacing={2} sx={{ mt: 2 }}>
            <BooleanInput
              source="metadata.sync"
              label="Sync to child tenants"
              helperText="When disabled, this resource server stays on the control plane and is not propagated to child tenants."
              format={(value) => value !== false}
              parse={(checked) => checked}
              disabled={isSystem}
            />
          </Stack>

          <Stack spacing={2} direction="row" sx={{ mt: 2 }}>
            <TextInput
              source="signing_alg"
              defaultValue="RS256"
              helperText="Signing algorithm for tokens"
              disabled={isSystem}
            />
          </Stack>

          <Stack spacing={2} direction="row" sx={{ mt: 2 }}>
            <NumberInput
              source="token_lifetime"
              defaultValue={86400}
              helperText="Access token lifetime in seconds (default: 86400 = 24 hours)"
            />
            <NumberInput
              source="token_lifetime_for_web"
              defaultValue={7200}
              helperText="Access token lifetime in seconds for browser-based (SPA) clients (default: 7200 = 2 hours)"
            />
          </Stack>

          <Stack spacing={2} direction="row" sx={{ mt: 4 }}>
            <Labeled label="Created At">
              <DateField source="created_at" showTime={true} />
            </Labeled>
            <Labeled label="Updated At">
              <DateField source="updated_at" showTime={true} />
            </Labeled>
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="RBAC">
          <Stack spacing={3}>
            <BooleanInput
              source="options.enforce_policies"
              label="Enable RBAC"
              helperText="Enable Role-Based Access Control for this resource server"
              disabled={isSystem}
            />

            <FormDataConsumer>
              {({ formData }) => (
                <BooleanInput
                  source="options.token_dialect"
                  label="Add permissions in token"
                  helperText="Include permissions directly in the access token"
                  disabled={isSystem || !formData?.options?.enforce_policies}
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
          <ScopesTabContent />
        </TabbedForm.Tab>
      </TabbedForm>
    </>
  );
}

export function ResourceServerEdit() {
  return (
    <Edit>
      <ResourceServerForm />
    </Edit>
  );
}
