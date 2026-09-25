import { useInput } from "ra-core";
import { BooleanInput, SelectInput } from "@/components/admin";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const CUSTOM_AUTHENTICATION = "custom_authentication";

// Not a BooleanInput: that one writes `false` into an untouched field, which
// would send `token_exchange.allow_any_profile_of_type: false` on every save.
// This only writes when toggled, and always writes the array shape.
function CustomTokenExchangeToggle() {
  const { field } = useInput({
    source: "token_exchange.allow_any_profile_of_type",
  });
  const enabled =
    Array.isArray(field.value) && field.value.includes(CUSTOM_AUTHENTICATION);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Switch
          id="custom-token-exchange"
          checked={enabled}
          onCheckedChange={(checked) =>
            field.onChange(checked ? [CUSTOM_AUTHENTICATION] : [])
          }
        />
        <Label htmlFor="custom-token-exchange">Custom Token Exchange</Label>
      </div>
      <p className="text-sm text-muted-foreground">
        Let this application exchange subject tokens at /oauth/token through the
        tenant&apos;s Custom Token Exchange profiles.
      </p>
    </div>
  );
}

const TOKEN_ENDPOINT_AUTH_METHOD_CHOICES = [
  { id: "none", name: "None (public client, PKCE)" },
  { id: "client_secret_basic", name: "Basic (HTTP Basic header)" },
  { id: "client_secret_post", name: "Post (form body)" },
  { id: "client_secret_jwt", name: "JWT signed with client secret (HS256)" },
  {
    id: "private_key_jwt",
    name: "JWT signed with private key (asymmetric)",
  },
];

export function AdvancedTab() {
  return (
    <>
      <p className="text-sm text-muted-foreground mb-2">
        These settings control OAuth/OIDC protocol conformance behavior.
      </p>
      <SelectInput
        source="token_endpoint_auth_method"
        label="Token Endpoint Authentication Method"
        choices={TOKEN_ENDPOINT_AUTH_METHOD_CHOICES}
        helperText="How the client authenticates to the /oauth/token endpoint. SPA and Native apps should use 'None'. Confidential clients (Regular Web, M2M) typically use Basic or Post. JWT-based methods (private_key_jwt) require a configured jwks_uri."
      />
      <BooleanInput
        source="oidc_conformant"
        label="OIDC Conformant"
        helperText="When enabled, the client strictly follows the OIDC specification. Affects token claims, scopes, and other protocol behaviors."
      />
      <BooleanInput
        source="is_first_party"
        label="First Party Application"
        helperText="First-party applications are trusted and don't require user consent for standard scopes."
      />
      <BooleanInput
        source="sso_disabled"
        label="SSO Disabled"
        helperText="When enabled, this client won't reuse existing SSO sessions. Users must authenticate every time."
      />
      <CustomTokenExchangeToggle />
    </>
  );
}
