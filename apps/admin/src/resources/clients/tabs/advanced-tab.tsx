import { BooleanInput, SelectInput } from "@/components/admin";

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
    </>
  );
}
