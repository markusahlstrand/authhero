import { BooleanInput } from "@/components/admin";

export function AdvancedTab() {
  return (
    <>
      <p className="text-sm text-muted-foreground mb-2">
        These settings control OAuth/OIDC protocol conformance behavior.
      </p>
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
