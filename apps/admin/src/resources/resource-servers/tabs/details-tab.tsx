import { useRecordContext } from "ra-core";
import {
  BooleanInput,
  DateField,
  NumberInput,
  TextInput,
} from "@/components/admin";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function DetailsTab() {
  const record = useRecordContext<{ id?: string; is_system?: boolean }>();
  const isSystem = !!record?.is_system;

  return (
    <div className="flex flex-col gap-4">
      {isSystem && (
        <Alert>
          <AlertDescription>
            This Resource Server represents a system entity. Most fields cannot
            be modified or deleted, but you can still configure token lifetime
            and authorize applications to consume this resource server.
          </AlertDescription>
        </Alert>
      )}

      <TextInput source="name" disabled={isSystem} />
      <TextInput
        source="identifier"
        disabled={isSystem}
        helperText="Unique identifier for this resource server"
      />

      <div className="flex flex-wrap gap-4">
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
      </div>

      <BooleanInput
        source="metadata.sync"
        label="Sync to child tenants"
        helperText="When disabled, this resource server stays on the control plane and is not propagated to child tenants."
        disabled={isSystem}
      />

      <TextInput
        source="signing_alg"
        defaultValue="RS256"
        helperText="Signing algorithm for tokens"
        disabled={isSystem}
      />

      <div className="flex flex-wrap gap-4">
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
      </div>

      {record?.id && (
        <div className="flex flex-wrap gap-8 pt-2 text-sm">
          <div>
            <div className="text-muted-foreground">Created at</div>
            <DateField source="created_at" showTime />
          </div>
          <div>
            <div className="text-muted-foreground">Updated at</div>
            <DateField source="updated_at" showTime />
          </div>
        </div>
      )}
    </div>
  );
}
