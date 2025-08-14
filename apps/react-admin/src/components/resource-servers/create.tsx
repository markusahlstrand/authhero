import {
  Create,
  SimpleForm,
  TextInput,
  BooleanInput,
  ArrayInput,
  SimpleFormIterator,
  required,
  NumberInput,
} from "react-admin";
import { Stack } from "@mui/material";

export function ResourceServerCreate() {
  return (
    <Create>
      <SimpleForm>
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
          <BooleanInput source="allow_offline_access" defaultValue={true} />
          <BooleanInput
            source="skip_consent_for_verifiable_first_party_clients"
            defaultValue={true}
          />
          <BooleanInput source="enforce_policies" defaultValue={true} />
        </Stack>

        <Stack spacing={2} direction="row" sx={{ mt: 2 }}>
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

        <ArrayInput source="scopes" label="Scopes">
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
      </SimpleForm>
    </Create>
  );
}
