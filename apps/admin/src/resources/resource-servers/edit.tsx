import {
  Edit,
  SimpleForm,
  TextInput,
  BooleanInput,
  NumberInput,
  ArrayInput,
  SimpleFormIterator,
} from "@/components/admin";
import { useRecordContext } from "ra-core";
import { Alert, AlertDescription } from "@/components/ui/alert";

function ResourceServerForm() {
  const record = useRecordContext<{ is_system?: boolean }>();
  const isSystem = !!record?.is_system;

  return (
    <SimpleForm>
      {isSystem && (
        <Alert>
          <AlertDescription>
            This Resource Server represents a system entity. Most fields cannot
            be modified or deleted, but you can still configure token lifetime.
          </AlertDescription>
        </Alert>
      )}
      <TextInput source="name" disabled={isSystem} />
      <TextInput source="identifier" disabled={isSystem} />
      <TextInput
        source="signing_alg"
        defaultValue="RS256"
        disabled={isSystem}
      />
      <TextInput
        source="signing_alg_values_supported"
        label="Signing algorithms supported"
        disabled={isSystem}
      />
      <BooleanInput
        source="allow_offline_access"
        defaultValue={true}
        disabled={isSystem}
      />
      <BooleanInput
        source="skip_consent_for_verifiable_first_party_clients"
        defaultValue={true}
        disabled={isSystem}
      />
      <BooleanInput
        source="metadata.sync"
        label="Sync metadata"
        disabled={isSystem}
      />
      <NumberInput source="token_lifetime" defaultValue={86400} />
      <NumberInput source="token_lifetime_for_web" defaultValue={7200} />

      <BooleanInput
        source="options.enforce_policies"
        label="RBAC: enforce policies"
        disabled={isSystem}
      />
      <TextInput
        source="options.token_dialect"
        label="Token dialect"
        disabled={isSystem}
      />

      <ArrayInput source="scopes" label="Scopes">
        <SimpleFormIterator inline disabled={isSystem}>
          <TextInput
            source="value"
            label="Scope"
            required
            disabled={isSystem}
          />
          <TextInput
            source="description"
            label="Description"
            disabled={isSystem}
          />
        </SimpleFormIterator>
      </ArrayInput>
    </SimpleForm>
  );
}

export function ResourceServerEdit() {
  return (
    <Edit>
      <ResourceServerForm />
    </Edit>
  );
}
