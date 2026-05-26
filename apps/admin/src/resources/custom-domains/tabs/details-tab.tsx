import { TextInput, SelectInput } from "@/components/admin";
import { SecretInput } from "@/common/SecretInput";

export function DetailsTab() {
  return (
    <div className="flex flex-col gap-3 max-w-2xl">
      <TextInput source="domain" />
      <TextInput source="status" readOnly />

      <SelectInput
        source="domain_metadata.ssl.certificate_authority"
        label="Certificate Authority"
        choices={[
          { id: "google", name: "Google Trust Services" },
          { id: "lets_encrypt", name: "Let's Encrypt" },
          { id: "sectigo", name: "Sectigo" },
          { id: "digicert", name: "DigiCert (Enterprise)" },
        ]}
      />
      <SelectInput
        source="domain_metadata.ssl.method"
        label="SSL Verification Method"
        choices={[
          { id: "txt", name: "TXT" },
          { id: "http", name: "HTTP" },
          { id: "email", name: "Email" },
        ]}
      />

      <SelectInput
        source="email_service"
        choices={[
          { id: "mailchannels", name: "Mailchannels" },
          { id: "mailgun", name: "Mailgun" },
        ]}
      />
      <SecretInput
        source="dkim_private_key"
        label="DKIM Private Key (PEM)"
        multiline
      />
      <SecretInput
        source="dkim_public_key"
        label="DKIM Public Key (PEM)"
        multiline
      />
      <SecretInput source="email_api_key" label="Email API Key" />
    </div>
  );
}
