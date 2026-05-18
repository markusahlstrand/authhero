import {
  BooleanInput,
  NumberInput,
  SelectInput,
} from "@/components/admin";

// API schema marks refresh_token.* numeric fields as .optional() (accepts
// undefined, not null). NumberInput's default parse returns null for cleared
// fields — override so cleared values become undefined and get omitted from
// the JSON payload.
const parseOptionalNumber = (value: string) => {
  if (value === "" || value == null) return undefined as unknown as number;
  const n = Number(value);
  return Number.isNaN(n) ? (undefined as unknown as number) : n;
};

export function RefreshTokensTab() {
  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Configure refresh token rotation, reuse-detection leeway, and expiration
        for this client.
      </p>
      <SelectInput
        source="refresh_token.rotation_type"
        label="Rotation"
        choices={[
          { id: "non-rotating", name: "Non-rotating (legacy)" },
          { id: "rotating", name: "Rotating (recommended)" },
        ]}
        helperText="Whether refresh tokens are rotated on every exchange. Defaults to non-rotating."
      />
      <NumberInput
        source="refresh_token.leeway"
        label="Reuse-detection leeway (seconds)"
        min={0}
        max={600}
        parse={parseOptionalNumber}
        helperText="Seconds after a parent token's first rotation during which presenting it again still mints a sibling child instead of triggering reuse-detection. Only applies when rotation is enabled. Defaults to 30s."
      />
      <SelectInput
        source="refresh_token.expiration_type"
        label="Expiration type"
        choices={[
          { id: "expiring", name: "Expiring" },
          { id: "non-expiring", name: "Non-expiring" },
        ]}
        helperText="Auth0-compatible. Round-trips through the API but is not yet enforced by the engine."
      />
      <BooleanInput
        source="refresh_token.infinite_token_lifetime"
        label="No absolute expiry"
        helperText="Auth0-compatible. When set, refresh tokens have no absolute lifetime."
      />
      <NumberInput
        source="refresh_token.token_lifetime"
        label="Absolute lifetime (seconds)"
        min={0}
        max={2592000}
        parse={parseOptionalNumber}
        helperText="Auth0-compatible. Maximum total lifetime of a refresh token chain."
      />
      <BooleanInput
        source="refresh_token.infinite_idle_token_lifetime"
        label="No idle expiry"
        helperText="Auth0-compatible. When set, refresh tokens never time out from inactivity."
      />
      <NumberInput
        source="refresh_token.idle_token_lifetime"
        label="Idle (sliding) lifetime (seconds)"
        min={0}
        max={2592000}
        parse={parseOptionalNumber}
        helperText="Auth0-compatible. Inactivity window before a refresh token expires."
      />
    </div>
  );
}
