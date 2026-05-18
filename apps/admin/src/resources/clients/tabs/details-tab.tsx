import { useEffect, useState } from "react";
import { useInput, useRecordContext } from "ra-core";
import { Plus, Trash2 } from "lucide-react";
import {
  AutocompleteArrayInput,
  BooleanInput,
  DateField,
  SelectInput,
  TextArrayInput,
  TextInput,
} from "@/components/admin";
import { SecretInput } from "@/common/SecretInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const GRANT_TYPE_CHOICES = [
  { id: "implicit", name: "Implicit" },
  { id: "authorization_code", name: "Authorization Code" },
  { id: "refresh_token", name: "Refresh Token" },
  { id: "client_credentials", name: "Client Credentials" },
  { id: "password", name: "Password" },
  { id: "mfa", name: "MFA" },
  { id: "passwordless_otp", name: "Passwordless OTP" },
];

const EMAIL_VALIDATION_CHOICES = [
  { id: "disabled", name: "Disabled" },
  { id: "enabled", name: "Enabled" },
  { id: "enforced", name: "Enforced" },
];

// Free-form key/value rows of client_metadata. `email_validation` is rendered
// separately as a SelectInput above, so it's filtered out here. The legacy
// `disable_sign_ups` key (now stored on the connection) is filtered out so
// old records don't show it twice during a partial migration.
function ClientMetadataInput() {
  const { field } = useInput({ source: "client_metadata" });
  const record = useRecordContext();
  const value: Record<string, unknown> =
    field.value && typeof field.value === "object" ? field.value : {};

  const reserved = new Set(["email_validation", "disable_sign_ups"]);

  const [rows, setRows] = useState<Array<{ key: string; value: string }>>([]);

  useEffect(() => {
    const next = Object.entries(value)
      .filter(([k]) => !reserved.has(k))
      .map(([k, v]) => ({ key: k, value: v == null ? "" : String(v) }));
    setRows(next);
    // value is intentionally not in deps — we only seed the local rows from the
    // form state once per record load; subsequent edits flow through commit().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.name, record?.id]);

  const commit = (next: Array<{ key: string; value: string }>) => {
    const out: Record<string, unknown> = {};
    if ("email_validation" in value) out.email_validation = value.email_validation;
    for (const row of next) {
      const k = row.key.trim();
      if (k) out[k] = row.value;
    }
    field.onChange(out);
  };

  const handleChange = (
    i: number,
    field: "key" | "value",
    newValue: string,
  ) => {
    const next = rows.map((row, idx) =>
      idx === i ? { ...row, [field]: newValue } : row,
    );
    setRows(next);
    commit(next);
  };

  const handleAdd = () => {
    const next = [...rows, { key: "", value: "" }];
    setRows(next);
  };

  const handleRemove = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    setRows(next);
    commit(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>Application Metadata</Label>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={row.key}
            placeholder="Key"
            onChange={(e) => handleChange(i, "key", e.target.value)}
            className="max-w-xs"
          />
          <Input
            value={row.value}
            placeholder="Value"
            onChange={(e) => handleChange(i, "value", e.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove metadata entry"
            onClick={() => handleRemove(i)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-1" />
          Add metadata
        </Button>
      </div>
    </div>
  );
}

function Timestamps() {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <div className="grid grid-cols-2 gap-4 mt-2">
      <div>
        <Label className="text-xs text-muted-foreground">Created at</Label>
        <div className="text-sm">
          <DateField source="created_at" showTime />
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Updated at</Label>
        <div className="text-sm">
          <DateField source="updated_at" showTime />
        </div>
      </div>
    </div>
  );
}

export function DetailsTab() {
  return (
    <div className="flex flex-col gap-3">
      <TextInput source="id" readOnly />
      <TextInput source="name" />
      <SecretInput source="client_secret" />
      <BooleanInput
        source="auth0_conformant"
        label="Auth0 Conformant Mode"
        helperText="Enable Auth0-compatible behavior. Disable for strict OIDC compliance."
        defaultValue={true}
      />
      <BooleanInput
        source="hide_sign_up_disabled_error"
        label="Hide sign-up-disabled error (enumeration-safe)"
        helperText="When the password connection has disable_signup=true, suppress the explicit account-does-not-exist error and let the OTP/password challenge fail generically. Mitigates email enumeration at the cost of UX clarity."
      />
      <SelectInput
        source="client_metadata.email_validation"
        label="Email validation"
        choices={EMAIL_VALIDATION_CHOICES}
        defaultValue="disabled"
      />
      <ClientMetadataInput />
      <AutocompleteArrayInput
        source="grant_types"
        label="Grant Types"
        choices={GRANT_TYPE_CHOICES}
      />
      <TextArrayInput source="callbacks" label="Callbacks" />
      <TextArrayInput source="allowed_logout_urls" label="Allowed Logout URLs" />
      <TextArrayInput source="web_origins" label="Web Origins" />
      <TextArrayInput source="allowed_clients" label="Allowed Clients" />
      <Timestamps />
    </div>
  );
}
