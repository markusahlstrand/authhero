import { TextInput } from "@/components/admin";

export function SsoTab() {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-base font-semibold">SAML2 Web App</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Configure this client as a SAML 2.0 Service Provider. These settings
          control how SAML assertions are generated when this client initiates a
          SAML login flow.
        </p>
      </div>
      <TextInput
        source="addons.samlp.audience"
        label="Audience (Entity ID)"
        helperText="The intended recipient of the SAML assertion. Typically the Service Provider's Entity ID or Issuer URI. Defaults to the client_id if not set."
      />
      <TextInput
        source="addons.samlp.destination"
        label="Destination (ACS URL)"
        helperText="The Service Provider's Assertion Consumer Service URL where the SAML response will be POSTed."
      />
      <TextInput
        source="addons.samlp.mappings"
        label="Attribute Mappings"
        multiline
        helperText='JSON object mapping user profile fields to SAML attribute names. Example: {"email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"}'
        format={(value: unknown) =>
          value ? JSON.stringify(value, null, 2) : ""
        }
        parse={(value: string) => {
          if (!value) return {};
          try {
            return JSON.parse(value);
          } catch {
            throw new Error("Invalid JSON");
          }
        }}
      />
    </div>
  );
}
